import { defineStore } from "pinia";
import { ref } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import {
  SignerManager,
  HostProvider,
  type HostProviderOptions,
  type ProductAccount,
  type Result,
  type SignerAccount,
  SignerError,
  ok,
} from "@parity/product-sdk-signer";
import { requestResourceAllocation } from "@parity/product-sdk-host";
import { useNetworkStore } from "./useNetworkStore";
import { useUserStoreManager } from "./useUserStoreManager";
import { PopStatus, type TransactionStatus } from "@/type";

// Nova @novasamatech/product-sdk@0.7.9-4 ships a `signerType` arg on
// getProductAccountSigner that routes through host_create_transaction, but
// the Parity SDK's exposed TypeScript surface doesn't expose it yet. Widen
// at the call site. Pattern mirrors ~/playground-app/src/utils/contracts.ts.
type AccountsProviderWithSignerType = {
  getProductAccountSigner: (
    account: ProductAccount,
    signerType?: "signPayload" | "createTransaction",
  ) => PolkadotSigner;
};

class ProductAccountHostProvider extends HostProvider {
  constructor(
    private readonly dotNsId: string,
    options?: HostProviderOptions,
  ) {
    super(options);
  }

  async connect(signal?: AbortSignal): Promise<Result<SignerAccount[], SignerError>> {
    const base = await super.connect(signal);
    if (!base.ok) return base;
    const product = await this.getProductAccount(this.dotNsId);
    if (!product.ok) return product;
    const acc = product.value;
    const productAccount: ProductAccount = {
      dotNsIdentifier: this.dotNsId,
      derivationIndex: 0,
      publicKey: acc.publicKey,
    };
    return ok([
      {
        ...acc,
        getSigner: () => {
          const provider = (
            this as unknown as { accountsProvider: AccountsProviderWithSignerType | null }
          ).accountsProvider;
          if (!provider) throw new Error("Host provider is disconnected");
          return provider.getProductAccountSigner(productAccount, "createTransaction");
        },
      },
    ]);
  }
}

const manager = new SignerManager({
  ss58Prefix: 0,
  dappName: "dotns-ui",
  createProvider: (type) => {
    if (type !== "host") {
      throw new Error(`Unsupported provider type: ${type}`);
    }
    return new ProductAccountHostProvider(window.location.host);
  },
});

// ----------------------------------------------------------------------------
// Resource-allocation request, cached per product-account h160 across reloads
//
// Bundles SmartContractAllowance (required for Revive writes) and AutoSigning
// (future host capability — returns NotAvailable today, accepted as success so
// it ships with the migration). ChainSubmit is auto-requested by
// SignerManager.connect() and isn't part of this bundle.
// ----------------------------------------------------------------------------
const PERMISSION_STORAGE_PREFIX = "dotns-ui:permissions:v2:";
let permissionsRequested = false;

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

async function requestProductPermissions(account: SignerAccount): Promise<void> {
  if (permissionsRequested) return;
  // Claim the slot synchronously, before any await. The subscribe handler can
  // fire multiple "connected" ticks back-to-back as selectedAccount transitions
  // from null to set; without the immediate flag, both ticks would race past
  // the cache read and double-prompt.
  permissionsRequested = true;
  if (hasGrantedPermissions(account.h160Address)) return;
  try {
    const outcomes = await requestResourceAllocation([
      { tag: "SmartContractAllowance", value: 0 },
      { tag: "AutoSigning", value: undefined },
    ]);
    const smartContract = outcomes[0];
    const autoSigning = outcomes[1];
    console.log(
      `[WalletStore:requestProductPermissions] outcomes smartContract=${smartContract?.tag} autoSigning=${autoSigning?.tag}`,
    );
    // SmartContractAllowance must be Allocated to use Revive writes.
    // AutoSigning is accepted as Allocated or NotAvailable (host hasn't shipped
    // the backend yet); only an explicit Rejected counts against the cache.
    const smartContractOk = smartContract?.tag === "Allocated";
    const autoSigningOk = autoSigning?.tag === "Allocated" || autoSigning?.tag === "NotAvailable";
    if (smartContractOk && autoSigningOk) {
      markPermissionsGranted(account.h160Address);
    }
  } catch (err) {
    console.warn("[WalletStore:requestProductPermissions] request failed", err);
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

  const networkStore = useNetworkStore();
  const userStoreManager = useUserStoreManager();

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
      const connectRes = await manager.connect();
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
      const selectRes = manager.selectAccount(account.address);
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

      // Resource allocations are requested from the manager.subscribe handler
      // (disconnected → connected transition), fire-and-forget, cached per
      // account in hostLocalStorage. Out of this inline await chain so the
      // connect handshake isn't blocked on (or coupled to) the allocation
      // modal — the inline-await previously caused Desktop to freeze when a
      // second mobile prompt stacked on top of the still-settling SSO handshake.

      await userStoreManager.getUserStore(evmAddress.value);
      isConnected.value = true;
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
    console.log("[WalletStore:handleDisconnect] Wallet disconnected");
  }

  // React to host state transitions. Two responsibilities:
  //   1. Whenever a selectedAccount is present in a connected state, attempt
  //      the cached permission request. requestProductPermissions dedupes
  //      itself via permissionsRequested so multiple "connected" ticks (e.g.
  //      a transient one with selectedAccount=null followed by one with it
  //      set after manager.selectAccount) collapse into a single attempt.
  //   2. On a definitive disconnected while we believe we're connected:
  //      tear down local state and reset the permission gate so the next
  //      connect tries again. SignerManager auto-reconnects on transient
  //      drops so we don't react to those.
  let unsub: (() => void) | null = manager.subscribe((state) => {
    if (state.status === "connected" && state.selectedAccount) {
      void requestProductPermissions(state.selectedAccount);
    }
    if (state.status === "disconnected") {
      permissionsRequested = false;
      if (isConnected.value) handleDisconnect();
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

  async function convertToEVM(substrateAddr: string): Promise<Address> {
    let defaultAddress = zeroAddress as Address;
    try {
      setIsLoading(true);
      const client = await networkStore.getClient();
      defaultAddress = await client.getEvmAddress(substrateAddr);
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
