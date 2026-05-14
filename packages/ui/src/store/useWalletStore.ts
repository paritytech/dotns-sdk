import { defineStore } from "pinia";
import { ref } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import { SignerManager, HostProvider, type SignerAccount } from "@parity/product-sdk-signer";
import { useNetworkStore } from "./useNetworkStore";
import { useUserStoreManager } from "./useUserStoreManager";
import { PopStatus, type TransactionStatus } from "@/type";
import { hostBackedSyncStorage } from "@/lib/host/persistedStorage";

const manager = new SignerManager({
  ss58Prefix: 0,
  dappName: "dotns-ui",
  createProvider: (type) => {
    if (type !== "host") {
      throw new Error(`Unsupported provider type: ${type}`);
    }
    return new HostProvider({
      ss58Prefix: 0,
      loadSdk: async () => {
        console.log("[probe] loadSdk: importing @novasamatech/product-sdk");
        const sdk = await import("@novasamatech/product-sdk");
        console.log("[probe] loadSdk: import resolved", Object.keys(sdk));
        return sdk as never;
      },
      loadHostApiEnum: async () => {
        console.log("[probe] loadHostApiEnum: importing @novasamatech/host-api");
        const api = await import("@novasamatech/host-api");
        console.log("[probe] loadHostApiEnum: import resolved");
        return api as never;
      },
    });
  },
});

export const useWalletStore = defineStore(
  "useWalletStore",
  () => {
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
        console.log("[WalletStore:connectWallet] step 1: calling manager.connect()");

        const connectRes = await manager.connect();
        console.log("[WalletStore:connectWallet] step 3: manager.connect returned", {
          ok: connectRes.ok,
          accounts: connectRes.ok ? connectRes.value.length : null,
        });
        if (!connectRes.ok) {
          console.warn("[WalletStore:connectWallet] host connect failed", connectRes.error);
          hasWalletExtension.value = false;
          return false;
        }

        const pappId = window.location.host;
        console.log("[WalletStore:connectWallet] step 4: getProductAccount", pappId);
        const productRes = await manager.getProductAccount(pappId, 0);
        console.log("[WalletStore:connectWallet] step 5: getProductAccount returned", {
          ok: productRes.ok,
        });
        if (!productRes.ok) {
          console.warn("[WalletStore:connectWallet] no product account", productRes.error);
          hasWalletExtension.value = false;
          return false;
        }

        const account = productRes.value;
        console.log("[WalletStore:connectWallet] step 6: selectAccount", account.address);
        const selectRes = manager.selectAccount(account.address);
        if (!selectRes.ok) {
          console.warn("[WalletStore:connectWallet] selectAccount failed", selectRes.error);
          hasWalletExtension.value = false;
          return false;
        }

        hasWalletExtension.value = true;
        currentAccount.value = account;
        injected.value = manager.getSigner();

        substrateAddress.value = account.address;
        // SignerAccount.h160Address is keccak256(publicKey)[12..32], the same mapping
        // pallet-revive uses. Saves an RPC roundtrip vs ReviveApi.address(ss58).
        evmAddress.value = account.h160Address as Address;
        console.log("[WalletStore:connectWallet] step 7: addresses set", {
          substrate: account.address,
          evm: account.h160Address,
        });

        await userStoreManager.getUserStore(evmAddress.value);
        isConnected.value = true;
        console.log("[WalletStore:connectWallet] step 8: connected");
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

    // React to host disconnect events. SignerManager auto-reconnects on transient
    // drops; only a definitive "disconnected" status while we believe we're connected
    // should trigger our local teardown.
    let unsub: (() => void) | null = manager.subscribe((state) => {
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
  },
  {
    persist: {
      storage: hostBackedSyncStorage,
      // Only persist durable fields. Ephemeral state (isLoading, transactionStatus,
      // currentAccount, injected, hasWalletExtension) is recomputed every boot via
      // connectWallet() and would otherwise hammer the host's storage rate limit on
      // every keystroke that toggles loading state.
      pick: ["isConnected", "substrateAddress", "evmAddress", "userPopState"],
    },
  },
);
