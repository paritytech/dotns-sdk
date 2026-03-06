import { defineStore } from "pinia";
import { web3AccountsSubscribe, web3Enable, web3FromAddress } from "@polkadot/extension-dapp";
import type { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { ref } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getInjectedExtensions,
  connectInjectedExtension,
  type InjectedPolkadotAccount,
} from "polkadot-api/pjs-signer";
import { useNetworkStore } from "./useNetworkStore";
import { useUserStoreManager } from "./useUserStoreManager";
import { PopStatus, type TransactionStatus } from "@/type";

export const useWalletStore = defineStore(
  "useWalletStore",
  () => {
    const isConnected = ref(false);
    const evmAddress = ref<Address | null>(null);
    const substrateAddress = ref<string | null>(null);
    const hasWalletExtension = ref(false);
    const isLoading = ref(false);
    const injected = ref<any>(null);
    const accountChangeUnsub = ref<(() => void) | null>(null);
    const currentAccount = ref<InjectedAccountWithMeta | InjectedPolkadotAccount | null>(null);

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
      if (!isConnected.value || !substrateAddress.value) return;

      try {
        const reconnected = await connectWallet();
        if (!reconnected) {
          handleDisconnect();
        }
      } catch {
        handleDisconnect();
      }
    }

    async function connectWallet(): Promise<boolean> {
      try {
        const clientInstance = await networkStore.getClient();

        const papiExtensionNames = getInjectedExtensions();

        if (papiExtensionNames.length > 0) {
          const papiExtension = await connectInjectedExtension(papiExtensionNames[0]!);
          const papiAccounts = papiExtension.getAccounts();

          if (papiAccounts.length > 0 && papiAccounts[0]!.polkadotSigner) {
            const papiAccount = papiAccounts[0];
            currentAccount.value = papiAccount!;
            injected.value = papiAccount!.polkadotSigner;

            substrateAddress.value = papiAccount!.address;

            evmAddress.value = await clientInstance.getEvmAddress(papiAccount!.address);

            hasWalletExtension.value = true;
            isConnected.value = true;

            await userStoreManager.getUserStore(evmAddress.value);
            accountChangeUnsub.value = await listenForAccountChanges();
            return true;
          }
        }

        const legacyExtensions = await web3Enable("dotNS");
        if (!legacyExtensions.length) {
          hasWalletExtension.value = false;
          return false;
        }

        hasWalletExtension.value = true;

        const legacyAccounts = await legacyExtensions[0]!.accounts.get();
        if (!legacyAccounts.length) {
          return false;
        }

        const legacyAccount = legacyAccounts[0]!;
        currentAccount.value = legacyAccount as InjectedAccountWithMeta;

        const injector = await web3FromAddress(legacyAccount.address);
        injected.value = injector.signer;

        substrateAddress.value = legacyAccount.address;

        evmAddress.value = await clientInstance.getEvmAddress(legacyAccount.address);

        await userStoreManager.getUserStore(evmAddress.value);

        isConnected.value = true;
        return true;
      } catch (error) {
        console.warn("[WalletStore:connectWallet]", error);
        return false;
      }
    }

    async function listenForAccountChanges(): Promise<() => void> {
      try {
        const legacyExtensions = await web3Enable("dotNS");
        if (!legacyExtensions.length) {
          hasWalletExtension.value = false;
          return () => {};
        }

        hasWalletExtension.value = true;

        const unsubscribe = await web3AccountsSubscribe(async (accounts) => {
          await handleAccountChange(accounts);
        });

        return unsubscribe;
      } catch (error) {
        console.warn("[WalletStore:listenForAccountChanges]", error);
        hasWalletExtension.value = false;
        return () => {};
      }
    }

    async function handleAccountChange(accounts: InjectedAccountWithMeta[]): Promise<void> {
      if (accounts.length === 0) {
        handleDisconnect();
        return;
      }

      try {
        const clientInstance = await networkStore.getClient();

        const papiExtensionNames = getInjectedExtensions();
        if (papiExtensionNames.length > 0) {
          const papiExtension = await connectInjectedExtension(papiExtensionNames[0]!);
          const papiAccounts = papiExtension.getAccounts();

          const matchingPapiAccount = papiAccounts.find(
            (account) => account.address === accounts[0]!.address,
          );

          if (matchingPapiAccount && matchingPapiAccount.polkadotSigner) {
            currentAccount.value = matchingPapiAccount;
            injected.value = matchingPapiAccount.polkadotSigner;

            substrateAddress.value = matchingPapiAccount.address;

            evmAddress.value = await clientInstance.getEvmAddress(matchingPapiAccount.address);

            await userStoreManager.getUserStore(evmAddress.value);

            isConnected.value = true;

            return;
          }
        }

        currentAccount.value = accounts[0]!;
        const injector = await web3FromAddress(accounts[0]!.address);
        injected.value = injector.signer;

        substrateAddress.value = accounts[0]!.address;

        evmAddress.value = await clientInstance.getEvmAddress(accounts[0]!.address);

        await userStoreManager.getUserStore(evmAddress.value);

        isConnected.value = true;
      } catch (error) {
        console.warn("[WalletStore:handleAccountChange]", error);
      }
    }

    function handleDisconnect(): void {
      if (accountChangeUnsub.value) {
        accountChangeUnsub.value();
        accountChangeUnsub.value = null;
      }
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

    function getInjected(): any {
      ensureConnected();
      return injected.value;
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
      getInjected,
      convertToEVM,
    };
  },
  { persist: { storage: sessionStorage } },
);
