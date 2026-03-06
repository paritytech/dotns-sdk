import { defineStore } from "pinia";
import { ref } from "vue";
import {
  encodeFunctionData,
  keccak256,
  encodePacked,
  zeroAddress,
  zeroHash,
  type Address,
  type Hash,
  isAddress,
  decodeFunctionResult,
} from "viem";
import { useNetworkStore } from "./useNetworkStore";
import { useTransactionStore } from "./useTransactionStore";
import { useAbiStore } from "./useAbiStore";
import {
  filterDotNames,
  isValidSubstrateAddress,
  normalizeDomainName,
  ZERO_SUBSTRATE_ADDRESS,
} from "../utils";
import type { DotnsAvailability } from "@/type";
import { useResolverStore } from "./useResolverStore";
import { useWalletStore } from "./useWalletStore";

export const useUserStoreManager = defineStore("userStoreManager", () => {
  const userStore = ref<Address>(zeroAddress);
  const walletStore = useWalletStore();
  const networkStore = useNetworkStore();
  const transactionStore = useTransactionStore();
  const resolverStore = useResolverStore();
  const abiStore = useAbiStore();

  function encodeKey(walletAddress: Address, value: string): Hash {
    return keccak256(encodePacked(["address", "string"], [walletAddress, value]));
  }

  async function getUserStore(accountEvm: Address): Promise<Address> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.storeFactory) throw new Error("StoreFactory not configured");

      const client = await networkStore.getClient();

      const data = encodeFunctionData({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        args: [accountEvm],
      });

      const raw = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress ?? ZERO_SUBSTRATE_ADDRESS,
        network.storeFactory,
        data,
      );

      const store = decodeFunctionResult({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        data: raw,
      }) as Address;

      userStore.value = store;
      return store;
    } catch (error) {
      console.warn("[UserStoreManager:getUserStore]", error);
      userStore.value = zeroAddress;
      return zeroAddress;
    }
  }

  async function deployStore(): Promise<Hash> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.storeFactory) throw new Error("StoreFactory not configured");

      // Check if Store already exists
      const existing = await getUserStore(walletStore.evmAddress as Address);
      if (existing !== zeroAddress) {
        console.log("[UserStoreManager:deployStore] Store already exists:", existing);
        return zeroHash;
      }

      const client = await networkStore.getClient();

      const data = encodeFunctionData({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "deploy",
        args: [],
      });

      const hash = await transactionStore.ethTransact(
        client,
        walletStore.getInjected(),
        walletStore.substrateAddress!,
        { to: network.storeFactory, data },
      );

      // Update cached Store address
      await getUserStore(walletStore.evmAddress as Address);

      return hash;
    } catch (error) {
      console.warn("[UserStoreManager:deployStore]", error);
      throw error;
    }
  }

  async function getSubdomains(): Promise<string[]> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const store = await getUserStore(walletStore.evmAddress as Address);
      if (store === zeroAddress) {
        console.log("[UserStoreManager:getSubdomains] No Store deployed yet");
        return [];
      }

      const client = await networkStore.getClient();

      const data = encodeFunctionData({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        args: [],
      });

      const raw = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        store,
        data,
      );

      const allValues = decodeFunctionResult({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        data: raw,
      }) as string[];

      return filterDotNames(allValues);
    } catch (error) {
      console.warn("[UserStoreManager:getSubdomains]", error);
      return [];
    }
  }

  async function getSubdomainsForAddress(targetEvm: Address): Promise<string[]> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const network = networkStore.currentNetwork;
      if (!network?.storeFactory) throw new Error("StoreFactory not configured");

      const client = await networkStore.getClient();

      const storeCheckData = encodeFunctionData({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        args: [targetEvm],
      });

      const storeRaw = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        network.storeFactory,
        storeCheckData,
      );

      const store = decodeFunctionResult({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        data: storeRaw,
      }) as Address;

      if (store === zeroAddress) {
        console.log("[UserStoreManager:getSubdomainsForAddress] No Store deployed for", targetEvm);
        return [];
      }

      const valuesData = encodeFunctionData({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        args: [],
      });

      const valuesRaw = await transactionStore.ethCall(
        client,
        walletStore.substrateAddress!,
        store,
        valuesData,
      );

      const allValues = decodeFunctionResult({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        data: valuesRaw,
      }) as string[];

      return allValues;
    } catch (error) {
      console.warn("[UserStoreManager:getSubdomainsForAddress]", error);
      return [];
    }
  }

  async function checkHandleAvailability(
    nameOrAddress: string | Address,
  ): Promise<DotnsAvailability> {
    const original = nameOrAddress;

    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();

      if (typeof original === "string" && isValidSubstrateAddress(original)) {
        const evm = await walletStore.convertToEVM(original);
        const resolved = await resolverStore.resolveAddressToName(evm);
        return {
          available: !resolved,
          owner: evm,
          name: resolved ? normalizeDomainName(resolved) : null,
        };
      }

      if (typeof original === "string" && isAddress(original)) {
        const evm = original as Address;
        const resolved = await resolverStore.resolveAddressToName(evm);
        return {
          available: !resolved,
          owner: evm,
          name: resolved ? normalizeDomainName(resolved) : null,
        };
      }

      if (typeof original === "string") {
        const normalized = normalizeDomainName(original);

        const [resolvedAddress, nameOwner] = await Promise.all([
          resolverStore.resolveNameToAddress(normalized),
          resolverStore.getOwnerOfDomain(normalized),
        ]);

        const owner = resolvedAddress ?? nameOwner ?? zeroAddress;
        return {
          available: owner === zeroAddress,
          owner,
          name: normalized,
        };
      }

      return { available: false, owner: zeroAddress, name: String(original) };
    } catch (error) {
      console.warn("[UserStoreManager:checkHandleAvailability]", error);
      return {
        available: false,
        owner: zeroAddress,
        name: typeof original === "string" ? original : String(original),
      };
    }
  }

  return {
    userStore,
    getUserStore,
    deployStore,
    getSubdomains,
    getSubdomainsForAddress,
    checkHandleAvailability,
    encodeKey,
  };
});
