import { defineStore } from "pinia";
import { ref } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import { encodeAddress } from "@polkadot/util-crypto";
import type { PolkadotSigner } from "polkadot-api";
import { createAccountsProvider, type LegacyAccount } from "@novasamatech/product-sdk";
import { useNetworkStore } from "./useNetworkStore";
import { useUserStoreManager } from "./useUserStoreManager";
import { PopStatus, type TransactionStatus } from "@/type";
import { hostBackedSyncStorage } from "@/lib/host/persistedStorage";

const accountsProvider = createAccountsProvider();

export const useWalletStore = defineStore(
  "useWalletStore",
  () => {
    const isConnected = ref(false);
    const evmAddress = ref<Address | null>(null);
    const substrateAddress = ref<string | null>(null);
    const hasWalletExtension = ref(false);
    const isLoading = ref(false);
    const injected = ref<PolkadotSigner | null>(null);
    const currentAccount = ref<LegacyAccount | null>(null);

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
        const clientInstance = await networkStore.getClient();

        const result = await accountsProvider.getLegacyAccounts();
        if (result.isErr()) {
          // Common case: user not logged into the host — kept at debug to avoid console noise.
          console.debug("[WalletStore:connectWallet] no host accounts", result.error);
          hasWalletExtension.value = false;
          return false;
        }

        const accounts = result.value;
        if (accounts.length === 0) {
          hasWalletExtension.value = false;
          return false;
        }

        hasWalletExtension.value = true;

        const account = accounts[0]!;
        currentAccount.value = account;
        injected.value = accountsProvider.getLegacyAccountSigner(account);

        substrateAddress.value = encodeAddress(account.publicKey);
        evmAddress.value = await clientInstance.getEvmAddress(substrateAddress.value);

        await userStoreManager.getUserStore(evmAddress.value);
        isConnected.value = true;
        return true;
      } catch (error) {
        console.warn("[WalletStore:connectWallet]", error);
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
