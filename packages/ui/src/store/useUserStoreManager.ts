import { defineStore } from "pinia";
import { ref } from "vue";
import {
  encodeFunctionData,
  keccak256,
  encodePacked,
  zeroAddress,
  zeroHash,
  toHex,
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
import type { ContractAuthStatus, DotnsAvailability } from "@/type";
import { useResolverStore } from "./useResolverStore";
import { useWalletStore } from "./useWalletStore";

const BULLETIN_CID_KEY_PREFIX = "dotns.bulletin.";

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

  function getRequiredContracts(): { name: string; address: Address }[] {
    const network = networkStore.currentNetwork;
    const contracts: { name: string; address: Address }[] = [];
    if (network?.dotnsRegistrarController) {
      contracts.push({ name: "Registrar Controller", address: network.dotnsRegistrarController });
    }
    if (network?.dotnsRegistry) {
      contracts.push({ name: "Registry", address: network.dotnsRegistry });
    }
    if (network?.dotnsRegistrar) {
      contracts.push({ name: "Registrar", address: network.dotnsRegistrar });
    }
    return contracts;
  }

  async function ethRead(
    to: Address,
    functionName: string,
    abiName: "Store" | "StoreFactory",
    args: readonly unknown[],
    targetEvm?: Address,
  ): Promise<`0x${string}`> {
    const data = encodeFunctionData({
      abi: abiStore.getABI(abiName),
      functionName,
      args,
    });
    const client = await networkStore.getClient();
    let origin = walletStore.substrateAddress;
    if (!origin && targetEvm) {
      origin = await client.getSubstrateAddress(targetEvm);
    }
    return transactionStore.ethCall(client, origin || ZERO_SUBSTRATE_ADDRESS, to, data);
  }

  async function ethWrite(to: Address, data: `0x${string}`): Promise<Hash> {
    await walletStore.ensureReady();
    const client = await networkStore.getClient();
    return transactionStore.ethTransact(
      client,
      walletStore.getInjected(),
      walletStore.substrateAddress!,
      { to, data },
    );
  }

  async function getUserStore(accountEvm: Address): Promise<Address> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();

      const network = networkStore.currentNetwork;
      if (!network?.storeFactory) throw new Error("StoreFactory not configured");

      const raw = await ethRead(network.storeFactory, "getDeployedStore", "StoreFactory", [
        accountEvm,
      ]);

      const store = decodeFunctionResult({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        data: raw,
      }) as Address;

      userStore.value = store;
      return store;
    } catch (error) {
      const isZeroData =
        error instanceof Error && error.message.includes("Cannot decode zero data");
      if (!isZeroData) {
        console.warn("[UserStoreManager:getUserStore]", error);
      }
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

      const existing = await getUserStore(walletStore.evmAddress as Address);
      if (existing !== zeroAddress) return zeroHash;

      const data = encodeFunctionData({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "deploy",
        args: [],
      });

      const hash = await ethWrite(network.storeFactory, data);
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
      if (store === zeroAddress) return [];

      const raw = await ethRead(store, "getValues", "Store", []);
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

      const network = networkStore.currentNetwork;
      if (!network?.storeFactory) throw new Error("StoreFactory not configured");

      const storeRaw = await ethRead(
        network.storeFactory,
        "getDeployedStore",
        "StoreFactory",
        [targetEvm],
        targetEvm,
      );

      if (!storeRaw || storeRaw === "0x") return [];

      const store = decodeFunctionResult({
        abi: abiStore.getABI("StoreFactory"),
        functionName: "getDeployedStore",
        data: storeRaw,
      }) as Address;

      if (store === zeroAddress) return [];

      const valuesRaw = await ethRead(store, "getValues", "Store", [], targetEvm);

      if (!valuesRaw || valuesRaw === "0x") return [];

      const allValues = decodeFunctionResult({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        data: valuesRaw,
      }) as string[];

      return allValues;
    } catch (error) {
      const isZeroData =
        error instanceof Error && error.message.includes("Cannot decode zero data");
      if (!isZeroData) {
        console.warn("[UserStoreManager:getSubdomainsForAddress]", error);
      }
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

  async function getAuthorizationStatus(store: Address): Promise<ContractAuthStatus[]> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();

      const contracts = getRequiredContracts();
      if (contracts.length === 0) return [];

      const results = await Promise.all(
        contracts.map(async (c) => {
          try {
            const raw = await ethRead(store, "isAuthorized", "Store", [c.address]);
            const authorized = decodeFunctionResult({
              abi: abiStore.getABI("Store"),
              functionName: "isAuthorized",
              data: raw,
            }) as boolean;
            return { name: c.name, address: c.address, authorized };
          } catch {
            return { name: c.name, address: c.address, authorized: false };
          }
        }),
      );

      return results;
    } catch (error) {
      console.warn("[UserStoreManager:getAuthorizationStatus]", error);
      return getRequiredContracts().map((c) => ({ ...c, authorized: false }));
    }
  }

  async function authorizeContract(store: Address, contractAddress: Address): Promise<Hash> {
    walletStore.ensureWalletConnected();
    const data = encodeFunctionData({
      abi: abiStore.getABI("Store"),
      functionName: "authorizeStore",
      args: [contractAddress],
    });
    return ethWrite(store, data);
  }

  async function unauthorizeContract(store: Address, contractAddress: Address): Promise<Hash> {
    walletStore.ensureWalletConnected();
    const data = encodeFunctionData({
      abi: abiStore.getABI("Store"),
      functionName: "unauthorizeStore",
      args: [contractAddress],
    });
    return ethWrite(store, data);
  }

  async function batchAuthChanges(
    store: Address,
    changes: { address: Address; authorize: boolean }[],
  ): Promise<Hash> {
    await walletStore.ensureReady();
    walletStore.ensureWalletConnected();
    await abiStore.ensureAbis();

    const calls = changes.map((change) => ({
      to: store,
      data: encodeFunctionData({
        abi: abiStore.getABI("Store"),
        functionName: change.authorize ? "authorizeStore" : "unauthorizeStore",
        args: [change.address],
      }),
    }));

    if (calls.length === 1) {
      return ethWrite(calls[0]!.to, calls[0]!.data);
    }

    const client = await networkStore.getClient();
    return transactionStore.batchEthTransact(
      client,
      walletStore.getInjected(),
      walletStore.substrateAddress!,
      calls,
    );
  }

  async function isNameInStore(label: string): Promise<boolean> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const store = await getUserStore(walletStore.evmAddress as Address);
      if (store === zeroAddress) return false;

      const raw = await ethRead(store, "getValue", "Store", [keccak256(toHex(label))]);
      const value = decodeFunctionResult({
        abi: abiStore.getABI("Store"),
        functionName: "getValue",
        data: raw,
      }) as string;

      return value.length > 0;
    } catch (error) {
      console.warn("[UserStoreManager:isNameInStore]", error);
      return false;
    }
  }

  async function writeNameToStore(label: string): Promise<Hash> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const store = await getUserStore(walletStore.evmAddress as Address);
      if (store === zeroAddress) {
        throw new Error("Store not deployed. Please deploy your Store first.");
      }

      const data = encodeFunctionData({
        abi: abiStore.getABI("Store"),
        functionName: "setValue",
        args: [keccak256(toHex(label)), `${label}.dot`],
      });

      return ethWrite(store, data);
    } catch (error) {
      console.warn("[UserStoreManager:writeNameToStore]", error);
      throw error;
    }
  }

  async function getBulletinUploads(): Promise<string[]> {
    try {
      networkStore.ensureClient();
      await abiStore.ensureAbis();
      walletStore.ensureWalletConnected();

      const store = await getUserStore(walletStore.evmAddress as Address);
      if (store === zeroAddress) return [];

      const raw = await ethRead(store, "getValues", "Store", []);
      const allValues = decodeFunctionResult({
        abi: abiStore.getABI("Store"),
        functionName: "getValues",
        data: raw,
      }) as string[];

      return allValues.filter(
        (v) => typeof v === "string" && v.startsWith("baf") && !v.includes("."),
      );
    } catch (error) {
      console.warn("[UserStoreManager:getBulletinUploads]", error);
      return [];
    }
  }

  async function ensureStoreDeployed(): Promise<Address> {
    walletStore.ensureWalletConnected();
    let store = await getUserStore(walletStore.evmAddress as Address);

    if (store === zeroAddress) {
      await deployStore();
      store = await getUserStore(walletStore.evmAddress as Address);
    }

    if (store === zeroAddress) {
      throw new Error("Failed to deploy Store contract.");
    }

    const statuses = await getAuthorizationStatus(store);
    const unauthorized = statuses.filter((c) => !c.authorized);

    if (unauthorized.length > 0) {
      await batchAuthChanges(
        store,
        unauthorized.map((c) => ({ address: c.address, authorize: true })),
      );
    }

    return store;
  }

  async function writeCidToStore(cid: string): Promise<Hash> {
    networkStore.ensureClient();
    await abiStore.ensureAbis();

    const store = await ensureStoreDeployed();

    const key = keccak256(toHex(`${BULLETIN_CID_KEY_PREFIX}${cid}`));
    const data = encodeFunctionData({
      abi: abiStore.getABI("Store"),
      functionName: "setValue",
      args: [key, cid],
    });

    return ethWrite(store, data);
  }

  async function deleteCidFromStore(cid: string): Promise<Hash> {
    networkStore.ensureClient();
    await abiStore.ensureAbis();
    walletStore.ensureWalletConnected();

    const store = await getUserStore(walletStore.evmAddress as Address);
    if (store === zeroAddress) {
      throw new Error("Store not deployed.");
    }

    const key = keccak256(toHex(`${BULLETIN_CID_KEY_PREFIX}${cid}`));
    const data = encodeFunctionData({
      abi: abiStore.getABI("Store"),
      functionName: "deleteValue",
      args: [key],
    });

    return ethWrite(store, data);
  }

  return {
    userStore,
    getUserStore,
    deployStore,
    getSubdomains,
    getSubdomainsForAddress,
    checkHandleAvailability,
    getAuthorizationStatus,
    authorizeContract,
    unauthorizeContract,
    batchAuthChanges,
    isNameInStore,
    writeNameToStore,
    ensureStoreDeployed,
    writeCidToStore,
    deleteCidFromStore,
    getBulletinUploads,
    encodeKey,
  };
});
