import { defineStore } from "pinia";
import { ref } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import { SignerManager, HostProvider, type SignerAccount } from "@parity/product-sdk-signer";
import { requestPermission, requestResourceAllocation } from "@parity/product-sdk-host";
import { useUserStoreManager } from "./useUserStoreManager";
import { getChainClient } from "@/composables/useTypedAPI";
import { PopStatus, type TransactionStatus } from "@/type";

// Product-account signing is handled natively by HostProvider's `productAccount`
// option (signer ≥0.6.0): connect() fetches the per-dapp derived account (skipping
// the legacy-account fetch) and pins signing to `createTransaction`, so unknown
// signed-extensions like AsPgas on Paseo Next survive end-to-end. Replaces the
// former hand-rolled `class extends HostProvider` workaround.
export const signerManager = new SignerManager({
  ss58Prefix: 0,
  dappName: "dotns-ui",
  createProvider: (type) => {
    if (type !== "host") {
      throw new Error(`Unsupported provider type: ${type}`);
    }
    return new HostProvider({
      // ChainSubmit is requested explicitly at connect (see ensureChainSubmit),
      // so HostProvider's own auto-request stays off. Letting HostProvider
      // request it (true) would block account return on the prompt and delay
      // the header pill.
      productAccount: { dotNsIdentifier: window.location.host },
      requestChainSubmitPermission: false,
    });
  },
});

// Resource-allowance request, cached per product-account h160 across reloads.
//
// Requested lazily on the first write (via ensureSignerReady), NOT on connect,
// so passive browsing triggers no prompts. Covers:
//   - SmartContractAllowance: required for Revive contract writes.
//   - AutoSigning: future host capability (NotAvailable today, accepted).
//
// ChainSubmit is NOT here — it's the host's sign gate and is requested at
// connect, uncached (see ensureChainSubmit). It must reflect live host state
// every session, so it can't sit behind this persistent flag.
//
// Key version: bump ONLY when a stale "granted" flag would make new code behave
// wrongly — i.e. the acceptance policy for the cached allowances tightens. Every
// bump re-prompts all users, so don't bump for churn. Moving ChainSubmit OUT of
// this cache did NOT need a bump: an old flag still correctly means "allowances
// granted", and ChainSubmit is now requested fresh at connect regardless.
//   v3 (2026-05-19): force re-grant after desktop cache-clear drift.
//   v4 (2026-06-08): lazy-on-write + ChainSubmit folded into the bundle.
const PERMISSION_STORAGE_PREFIX = "dotns-ui:permissions:v4:";

function permissionStorageKey(h160: string): string {
  return `${PERMISSION_STORAGE_PREFIX}${h160.toLowerCase()}`;
}

function hasGrantedPermissions(h160: string): boolean {
  try {
    return localStorage.getItem(permissionStorageKey(h160)) === "granted";
  } catch {
    return false;
  }
}

function markPermissionsGranted(h160: string): void {
  try {
    localStorage.setItem(permissionStorageKey(h160), "granted");
  } catch {
    // swallow — host environments without localStorage just re-prompt next boot
  }
}

async function requestWritePermissions(account: SignerAccount): Promise<void> {
  if (hasGrantedPermissions(account.h160Address)) return;
  try {
    const [smartContract, autoSigning] = await requestResourceAllocation([
      { tag: "SmartContractAllowance", value: 0 },
      { tag: "AutoSigning", value: undefined },
    ]);
    console.log(
      `[WalletStore:requestWritePermissions] smartContract=${smartContract?.tag} autoSigning=${autoSigning?.tag}`,
    );
    // SmartContractAllowance must be Allocated for Revive writes. AutoSigning is
    // accepted as Allocated or NotAvailable (host hasn't shipped it yet).
    const smartContractOk = smartContract?.tag === "Allocated";
    const autoSigningOk = autoSigning?.tag === "Allocated" || autoSigning?.tag === "NotAvailable";
    if (smartContractOk && autoSigningOk) {
      markPermissionsGranted(account.h160Address);
    }
  } catch (err) {
    console.warn("[WalletStore:requestWritePermissions] request failed", err);
  }
}

export const useWalletStore = defineStore("useWalletStore", () => {
  const isConnected = ref(false);
  const evmAddress = ref<Address | null>(null);
  const substrateAddress = ref<string | null>(null);
  const hasWalletExtension = ref(false);
  const isLoading = ref(false);
  const injected = ref<PolkadotSigner | null>(null);
  const currentAccount = ref<SignerAccount | null>(null);

  const transactionStatus = ref<TransactionStatus>("idle");

  const userPopState = ref<PopStatus>(PopStatus.NoStatus);

  const userStoreManager = useUserStoreManager();

  // ChainSubmit is the host's sign gate: without it the host rejects every
  // createTransaction with PermissionDenied (often as a silent hang). Requested
  // once per session at connect — NOT cached in localStorage, because the grant
  // lives in host state that can reset independently of our storage, and a stale
  // "granted" flag would skip the request and let signing race ahead of the
  // prompt. The in-flight promise is shared so a write that fires before connect
  // finishes still awaits the same grant (see ensureSignerReady).
  let chainSubmitReady: Promise<boolean> | null = null;
  function ensureChainSubmit(): Promise<boolean> {
    if (!chainSubmitReady) {
      chainSubmitReady = requestPermission({ tag: "ChainSubmit", value: undefined })
        .then((granted) => {
          console.log(`[WalletStore:ensureChainSubmit] chainSubmit=${granted}`);
          return granted;
        })
        .catch((err) => {
          console.warn("[WalletStore:ensureChainSubmit] request failed", err);
          chainSubmitReady = null; // let the next write retry the grant
          return false;
        });
    }
    return chainSubmitReady;
  }

  function setIsLoading(status: boolean): void {
    isLoading.value = status;
  }

  function setTransactionStatus(status: TransactionStatus): void {
    transactionStatus.value = status;
  }

  async function init(): Promise<void> {
    try {
      const connected = await connectWallet();
      if (!connected) {
        handleDisconnect();
      }
    } catch {
      handleDisconnect();
    }
  }

  async function connectWallet(): Promise<boolean> {
    try {
      const connectRes = await signerManager.connect();
      if (!connectRes.ok) {
        console.warn("[WalletStore:connectWallet] host connect failed", connectRes.error);
        hasWalletExtension.value = false;
        return false;
      }

      const account = connectRes.value[0];
      if (!account) {
        console.warn("[WalletStore:connectWallet] no accounts returned");
        hasWalletExtension.value = false;
        return false;
      }
      const selectRes = signerManager.selectAccount(account.address);
      if (!selectRes.ok) {
        console.warn("[WalletStore:connectWallet] selectAccount failed", selectRes.error);
        hasWalletExtension.value = false;
        return false;
      }

      hasWalletExtension.value = true;
      currentAccount.value = account;
      injected.value = account.getSigner();

      substrateAddress.value = account.address;
      evmAddress.value = account.h160Address as Address;
      console.log(
        `[WalletStore:connectWallet] account state ss58=${account.address} h160=${evmAddress.value}`,
      );

      // Flip connected as soon as the account is known — the header pill and
      // Profile tab gate on isConnected only, so nothing UI-facing should wait
      // on the contract reads below.
      isConnected.value = true;

      // ChainSubmit is the host's sign gate. Request it here (uncached, every
      // session) AFTER flipping isConnected, so the pill never waits on the
      // permission round-trip and writes can't sign before it's granted.
      void ensureChainSubmit();

      // Background-warm the contract manager + chain client so the first
      // search/read is fast. Result is unused; allowance prompts stay lazy.
      void userStoreManager.getUserStore(evmAddress.value).catch(() => {});
      return true;
    } catch (error) {
      console.warn("[WalletStore:connectWallet] threw", error);
      return false;
    }
  }

  function handleDisconnect(): void {
    isConnected.value = false;
    evmAddress.value = null;
    substrateAddress.value = null;
    currentAccount.value = null;
    injected.value = null;
    userPopState.value = PopStatus.NoStatus;
    // Drop the ChainSubmit grant so a reconnect re-requests against fresh host
    // state rather than reusing a promise tied to the prior session.
    chainSubmitReady = null;
    console.log("[WalletStore:handleDisconnect] Wallet disconnected");
  }

  // React to host disconnects: on a definitive disconnected while we believe
  // we're connected, tear down local state. SignerManager auto-reconnects on
  // transient drops, so we don't react to those. (Write permissions are no
  // longer requested here — see ensureSignerReady.)
  let unsub: (() => void) | null = signerManager.subscribe((state) => {
    if (state.status === "disconnected" && isConnected.value) {
      handleDisconnect();
    }
  });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      unsub?.();
      unsub = null;
    });
  }

  function ensureConnected(): void {
    if (!injected.value || !currentAccount.value) {
      throw new Error("Wallet not connected");
    }
    if (!isConnected.value) {
      throw new Error("Wallet not connected");
    }
    if (!substrateAddress.value) {
      throw new Error("Substrate address not available");
    }
    if (!evmAddress.value) {
      throw new Error("EVM address not available");
    }
  }

  async function ensureReady(): Promise<void> {
    if (isConnected.value && (!injected.value || !currentAccount.value)) {
      const success = await connectWallet();
      if (!success) {
        handleDisconnect();
        throw new Error("Wallet session expired. Please reconnect.");
      }
    }
  }

  function getInjected(): PolkadotSigner {
    ensureConnected();
    return injected.value!;
  }

  let pendingSignerReady: Promise<PolkadotSigner> | null = null;
  // Connect-if-needed + confirm the host sign gate (ChainSubmit) and request
  // the cached write allowances before a signed write. Concurrent writes share
  // one in-flight request. Reads never call this, so passive browsing prompts
  // for nothing. Awaiting ensureChainSubmit() here guarantees the grant lands
  // before signing even if the write fires before connect's request resolves.
  async function ensureSignerReady(): Promise<PolkadotSigner> {
    if (pendingSignerReady) return pendingSignerReady;
    pendingSignerReady = (async () => {
      await ensureReady();
      ensureWalletConnected();
      const account = currentAccount.value;
      if (!account) throw new Error("Wallet not connected");
      await ensureChainSubmit();
      await requestWritePermissions(account);
      return getInjected();
    })().finally(() => {
      pendingSignerReady = null;
    });
    return pendingSignerReady;
  }

  async function convertToEVM(substrateAddr: string): Promise<Address> {
    let defaultAddress = zeroAddress as Address;
    try {
      setIsLoading(true);
      if (isAddress(substrateAddr)) return substrateAddr as Address;
      const chain = await getChainClient();
      defaultAddress = (await chain.assetHub.apis.ReviveApi.address(substrateAddr)) as Address;
    } catch (error) {
      console.warn("[WalletStore:convertToEVM]", error);
    } finally {
      setIsLoading(false);
    }
    return defaultAddress;
  }

  function ensureWalletConnected(): void {
    if (!substrateAddress.value) throw new Error("Wallet not connected");

    if (substrateAddress.value.startsWith("0x")) {
      throw new Error(
        "substrateAddress must be in SS58 format for Revive operations, not EVM format",
      );
    }

    if (!evmAddress.value || !isAddress(evmAddress.value)) {
      throw new Error("EVM address is required for Store operations");
    }
  }

  return {
    ensureWalletConnected,
    ensureSignerReady,
    isConnected,
    evmAddress,
    substrateAddress,
    hasWalletExtension,
    currentAccount,
    transactionStatus,
    setTransactionStatus,
    userPopState,
    isLoading,
    setIsLoading,
    init,
    connectWallet,
    handleDisconnect,
    ensureConnected,
    ensureReady,
    getInjected,
    convertToEVM,
  };
});
