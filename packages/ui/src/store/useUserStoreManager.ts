import { defineStore } from "pinia";
import {
  keccak256,
  toHex,
  stringToHex,
  hexToString,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  isAddress,
} from "viem";
import { getContract, getProxyContract, withContractRecovery } from "@/composables/useContracts";
import { useContractWrite } from "@/lib/contractWrite";
import { isValidSubstrateAddress, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";
import type { DotnsAvailability } from "@/type";
import { useResolverStore } from "./useResolverStore";
import { useWalletStore } from "./useWalletStore";

// Store getters cap each getLabels/getKeys call at this size, so reads must page.
const STORE_PAGE_SIZE = 256n;

const ZERO: Address = zeroAddress;

// Pages a store getter to completion; fetchPage returns one page, or null on query failure.
async function readAllPages<T>(
  fetchPage: (offset: bigint, limit: bigint) => Promise<readonly T[] | null>,
): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0n; ; offset += STORE_PAGE_SIZE) {
    const page = await fetchPage(offset, STORE_PAGE_SIZE);
    if (!page) break;
    items.push(...page);
    if (page.length < Number(STORE_PAGE_SIZE)) break;
  }
  return items;
}

// UserStore keys are bytes32. To stay interoperable with the CLI (`dotns store`),
// a plain string key is hashed exactly as the CLI does: keccak256(toHex(value)).
function userStoreKey(value: string): Hash {
  return keccak256(toHex(value));
}

export const useUserStoreManager = defineStore("userStoreManager", () => {
  const walletStore = useWalletStore();
  const resolverStore = useResolverStore();
  const { txOptions, withWrite, submitWrite } = useContractWrite();

  // LabelStore is protocol-deployed when a name is registered and holds the
  // user's labels. UserStore is user-claimed via claimUserStore and holds
  // arbitrary key/value data including Bulletin CIDs; ensureUserStore claims it
  // on first write.
  function readFactoryAddress(method: "getLabelStore" | "getUserStore", evm: Address) {
    return withContractRecovery(async () => {
      const factory = await getContract("@dotns/store-factory");
      const result = await factory[method]!.query(evm, { origin: ZERO_SUBSTRATE_ADDRESS });
      return result.success ? ((result.value as Address) ?? ZERO) : ZERO;
    });
  }

  async function getLabelStore(evm: Address): Promise<Address> {
    return readFactoryAddress("getLabelStore", evm);
  }

  async function getUserStore(evm: Address): Promise<Address> {
    return readFactoryAddress("getUserStore", evm);
  }

  // Claim the caller's UserStore (StoreFactory.claimUserStore). Required once
  // before any write to user data; returns the claim transaction hash.
  async function claimUserStore(): Promise<Hash> {
    return withWrite(async () => {
      const factory = await getContract("@dotns/store-factory");
      return submitWrite(factory.claimUserStore!.tx(txOptions()), "Claim store");
    });
  }

  // Resolve the caller's UserStore, claiming it first if they have none. This is
  // the guard every write-to-store action should call before writing.
  async function ensureUserStore(): Promise<Address> {
    const evm = walletStore.evmAddress as Address | undefined;
    if (!evm) throw new Error("Connect a wallet to claim a UserStore.");
    const existing = await getUserStore(evm);
    if (existing !== ZERO) return existing;
    await claimUserStore();
    const claimed = await getUserStore(evm);
    if (claimed === ZERO) throw new Error("UserStore claim did not produce a store address.");
    return claimed;
  }

  async function getSubdomainsForAddress(evm: Address): Promise<string[]> {
    return withContractRecovery(async () => {
      const labelStore = await getLabelStore(evm);
      if (labelStore === ZERO) return [];
      const store = await getProxyContract("@dotns/label-store", labelStore);
      return readAllPages<string>(async (offset, limit) => {
        const result = await store.getLabels!.query(offset, limit, {
          origin: ZERO_SUBSTRATE_ADDRESS,
        });
        return result.success ? ((result.value as string[]) ?? []) : null;
      });
    });
  }

  async function getSubdomains(): Promise<string[]> {
    const evm = walletStore.evmAddress;
    if (!evm) return [];
    return getSubdomainsForAddress(evm);
  }

  async function checkHandleAvailability(
    nameOrAddress: string | Address,
  ): Promise<DotnsAvailability> {
    const original = nameOrAddress;
    try {
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
        const owner = resolvedAddress ?? nameOwner ?? ZERO;
        return {
          available: owner === ZERO,
          owner,
          name: normalized,
        };
      }
      return { available: false, owner: ZERO, name: String(original) };
    } catch (error) {
      console.warn("[UserStoreManager:checkHandleAvailability]", error);
      return {
        available: false,
        owner: ZERO,
        name: typeof original === "string" ? original : String(original),
      };
    }
  }

  // Write a key/value into the caller's UserStore, claiming the store first if
  // they have none. The single canonical write path for user data.
  async function setUserStoreValue(key: Hash, value: Hex): Promise<Hash> {
    const store = await ensureUserStore();
    return withWrite(async () => {
      const proxy = await getProxyContract("@dotns/user-store", store);
      return submitWrite(proxy.setValue!.tx(key, value, txOptions()), "Save");
    });
  }

  // Persist a Bulletin CID. Key/value encoding matches the CLI so
  // `dotns store cids` and the UI read the same entries.
  async function writeCidToStore(cid: string): Promise<Hash> {
    return setUserStoreValue(userStoreKey(cid), stringToHex(cid));
  }

  // UserStore has no delete; clearing a key means writing an empty value, which
  // getBulletinUploads then filters out. Mirrors the CLI's delete behaviour.
  async function deleteCidFromStore(cid: string): Promise<Hash> {
    return setUserStoreValue(userStoreKey(cid), "0x");
  }

  // Arbitrary string key/value access mirroring the CLI `store get/set/delete`.
  // Keys are hashed (keccak256(toHex(key))), so they are write/lookup only and
  // cannot be enumerated back to their original string.
  async function setStringValue(key: string, value: string): Promise<Hash> {
    return setUserStoreValue(userStoreKey(key), stringToHex(value));
  }

  async function deleteStringValue(key: string): Promise<Hash> {
    return setUserStoreValue(userStoreKey(key), "0x");
  }

  async function getStringValue(key: string): Promise<string | null> {
    return withContractRecovery(async () => {
      const evm = walletStore.evmAddress as Address | undefined;
      if (!evm) return null;
      const store = await getUserStore(evm);
      if (store === ZERO) return null;
      const proxy = await getProxyContract("@dotns/user-store", store);
      const result = await proxy.getValue!.query(userStoreKey(key), {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return null;
      const raw = result.value as Hex;
      if (!raw || raw === "0x") return null;
      return hexToString(raw) || null;
    });
  }

  async function getBulletinUploads(): Promise<string[]> {
    return withContractRecovery(async () => {
      const evm = walletStore.evmAddress as Address | undefined;
      if (!evm) return [];
      const store = await getUserStore(evm);
      if (store === ZERO) return [];

      const proxy = await getProxyContract("@dotns/user-store", store);
      const keys = await readAllPages<Hash>(async (offset, limit) => {
        const keysResult = await proxy.getKeys!.query(offset, limit, {
          origin: ZERO_SUBSTRATE_ADDRESS,
        });
        return keysResult.success ? ((keysResult.value as Hash[]) ?? []) : null;
      });

      const cids: string[] = [];
      for (const key of keys) {
        const valueResult = await proxy.getValue!.query(key, { origin: ZERO_SUBSTRATE_ADDRESS });
        if (!valueResult.success) continue;
        const raw = valueResult.value as Hex;
        if (!raw || raw === "0x") continue;
        const decoded = hexToString(raw);
        if (decoded) cids.push(decoded);
      }
      return cids;
    });
  }

  return {
    getLabelStore,
    getUserStore,
    claimUserStore,
    getSubdomains,
    getSubdomainsForAddress,
    checkHandleAvailability,
    writeCidToStore,
    deleteCidFromStore,
    getBulletinUploads,
    setStringValue,
    getStringValue,
    deleteStringValue,
  };
});
