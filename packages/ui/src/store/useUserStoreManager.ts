import { defineStore } from "pinia";
import { ref } from "vue";
import { keccak256, encodePacked, zeroAddress, type Address, type Hash, isAddress } from "viem";
import { getContract, getProxyContract, withContractRecovery } from "@/composables/useContracts";
import { isValidSubstrateAddress, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "../utils";
import type { ContractAuthStatus, DotnsAvailability } from "@/type";
import { useResolverStore } from "./useResolverStore";
import { useWalletStore } from "./useWalletStore";

// Maximum LabelStore entries enumerated per page. A user with more than 256
// registered domains would need a paginated read; treat as a soft cap.
const LABEL_STORE_PAGE = 256n;

const ZERO: Address = zeroAddress;

export const useUserStoreManager = defineStore("userStoreManager", () => {
  // Exposed for back-compat with the old single-Store model. Populated by
  // getUserStore() but no longer load-bearing — readers should call the
  // helpers directly.
  const userStore = ref<Address>(ZERO);

  const walletStore = useWalletStore();
  const resolverStore = useResolverStore();

  function encodeKey(walletAddress: Address, value: string): Hash {
    return keccak256(encodePacked(["address", "string"], [walletAddress, value]));
  }

  // ---------------------------------------------------------------------
  // StoreFactory lookups (new two-Store model)
  //
  // LabelStore is protocol-managed — deployed by the registrar/controller
  // when the user registers a name. Holds the user's domain labels.
  // UserStore is user-claimed (via claimUserStore) — holds arbitrary KV data
  // including Bulletin CIDs. We don't claim UserStores in this build.
  // ---------------------------------------------------------------------
  async function getLabelStore(evm: Address): Promise<Address> {
    return withContractRecovery(async () => {
      const factory = await getContract("@dotns/store-factory");
      const result = await factory.getLabelStore!.query(evm, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!result.success) return ZERO;
      return (result.value as Address) ?? ZERO;
    });
  }

  async function getUserStore(evm: Address): Promise<Address> {
    return withContractRecovery(async () => {
      const factory = await getContract("@dotns/store-factory");
      const result = await factory.getUserStore!.query(evm, { origin: ZERO_SUBSTRATE_ADDRESS });
      const addr = result.success ? ((result.value as Address) ?? ZERO) : ZERO;
      userStore.value = addr;
      return addr;
    });
  }

  async function getSubdomainsForAddress(evm: Address): Promise<string[]> {
    return withContractRecovery(async () => {
      const labelStore = await getLabelStore(evm);
      if (labelStore === ZERO) return [];
      const store = await getProxyContract("@dotns/label-store", labelStore);
      const result = await store.getLabels!.query(0n, LABEL_STORE_PAGE, {
        origin: ZERO_SUBSTRATE_ADDRESS,
      });
      if (!result.success) return [];
      return (result.value as string[]) ?? [];
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

  // ---------------------------------------------------------------------
  // Deprecated single-Store API — stubs to preserve compile-time consumers
  //
  // The old Store model had: explicit `deploy()`, per-contract authorization,
  // and unified setValue/getValue across labels and user data. The new model
  // splits these:
  //   - LabelStore is protocol-deployed during register(); no `deploy()` needed
  //   - No per-contract authorization (protocol registry gates writers)
  //   - UserStore writes (Bulletin CIDs) require `claimUserStore` — OOS today
  //
  // Stubs keep ProfileView, WhoProfileView, TryStoreLookup, FileUpload, and
  // useBulletinStore compiling without changing their UI shape. Read paths
  // return inert defaults; write paths throw a migration message so a clicked
  // button surfaces a toast rather than silently doing nothing.
  // ---------------------------------------------------------------------
  async function getAuthorizationStatus(store: Address): Promise<ContractAuthStatus[]> {
    void store;
    return [];
  }

  async function isNameInStore(label: string): Promise<boolean> {
    void label;
    return true;
  }

  function migrationDisabled(op: string): never {
    throw new Error(`${op} is not supported on the v2 architecture migration.`);
  }

  async function deployStore(): Promise<Hash> {
    return migrationDisabled("Store deployment");
  }

  async function batchAuthChanges(
    store: Address,
    changes: { address: Address; authorize: boolean }[],
  ): Promise<Hash> {
    void store;
    void changes;
    return migrationDisabled("Contract authorization changes");
  }

  async function writeNameToStore(label: string): Promise<Hash> {
    void label;
    return migrationDisabled("writeNameToStore");
  }

  async function writeCidToStore(cid: string): Promise<Hash> {
    void cid;
    return migrationDisabled("Bulletin CID writes");
  }

  async function deleteCidFromStore(cid: string): Promise<Hash> {
    void cid;
    return migrationDisabled("Bulletin CID deletes");
  }

  async function getBulletinUploads(): Promise<string[]> {
    return [];
  }

  return {
    userStore,
    getLabelStore,
    getUserStore,
    getSubdomains,
    getSubdomainsForAddress,
    checkHandleAvailability,
    encodeKey,
    // deprecated stubs
    getAuthorizationStatus,
    isNameInStore,
    deployStore,
    batchAuthChanges,
    writeNameToStore,
    writeCidToStore,
    deleteCidFromStore,
    getBulletinUploads,
  };
});
