import {
  ContractManager,
  createContract,
  createContractRuntimeFromClient,
  type AbiEntry,
  type CdmJson,
  type Contract,
  type ContractDef,
  type TxOptions,
} from "@parity/product-sdk-contracts";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import type { HexString } from "polkadot-api";

// Default options applied to every contract write (.tx()) in this app.
//
// `storageDepositLimit`: SDK's buildReviveCall passes the dry-run's exact
// storage_deposit value with no buffer; chain state can grow between dry-run
// and on-chain execution (e.g., `register()` deploying a fresh LabelStore
// proxy) and the tx then reverts as Revive.ContractReverted. Pre-Phase-5 code
// used max(2 PAS, dryRun * 1.2). 6 PAS was tried first (matching the OLD
// formula's effective max for register) and still hit the cap in practice,
// so we run with a higher 10 PAS ceiling. `storage_deposit_limit` is a cap,
// not a charge — the user pays only actual usage.
//
// `waitFor`: "finalized" mirrors the prior signSubmitAndWatch behavior of
// resolving only after block finalization (not just inclusion).
export const WRITE_TX_DEFAULTS: Pick<TxOptions, "storageDepositLimit" | "waitFor"> = {
  storageDepositLimit: 10_000_000_000_000n,
  waitFor: "finalized",
};
import cdmJsonRaw from "../../cdm.json" with { type: "json" };
import { getChainClient } from "@/composables/useTypedAPI";
import { useNetworkStore } from "@/store/useNetworkStore";
import { signerManager } from "@/store/useWalletStore";

const cdmJson = cdmJsonRaw as unknown as CdmJson;
const TARGET = "paseo-asset-hub-next-v2";

let managerPromise: Promise<ContractManager> | null = null;

export async function getContractManager(): Promise<ContractManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const chain = await getChainClient();
      const runtime = createContractRuntimeFromClient(chain.raw.assetHub, paseo_asset_hub);
      return new ContractManager(cdmJson, runtime, { signerManager, targetHash: TARGET });
    })();
  }
  return managerPromise;
}

export async function getContract(library: string): Promise<Contract<ContractDef>> {
  const m = await getContractManager();
  return m.getContract(library);
}

// Per-user beacon proxies (LabelStore, UserStore) have no fixed address in
// cdm.json — the address is resolved at call time via StoreFactory. Use the
// ABI from cdm.json combined with the dynamically-discovered address.
export async function getProxyContract(
  library: string,
  address: HexString,
): Promise<Contract<ContractDef>> {
  const m = await getContractManager();
  return createContract(m.getRuntime(), address, getAbi(library), { signerManager });
}

export function getAbi(library: string): AbiEntry[] {
  const entry = cdmJson.contracts?.[TARGET]?.[library];
  if (!entry) {
    throw new Error(`Library ${library} not in cdm.json target ${TARGET}`);
  }
  return entry.abi;
}

function destroyContractManager(): void {
  managerPromise = null;
}

const isNoActiveFollow = (err: unknown): boolean =>
  (err instanceof Error ? err.message : String(err)).includes("No active follow");

// Recovery ladder for transient/dead chainHead_follow subscriptions, mirrored
// from useTransactionStore.ethCall. Three attempts: original → 250ms wait +
// retry → reset chain client + manager + retry. PAPI v2's typed API doesn't
// auto-recover from a dropped follow, which fires after host modals pause the
// WebView.
export async function withContractRecovery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err1) {
    if (!isNoActiveFollow(err1)) throw err1;
    await new Promise((r) => setTimeout(r, 250));
    try {
      return await fn();
    } catch (err2) {
      if (!isNoActiveFollow(err2)) throw err2;
      console.warn("[useContracts] chainHead disjoint, resetting client + manager");
      useNetworkStore().resetClient();
      destroyContractManager();
      return await fn();
    }
  }
}
