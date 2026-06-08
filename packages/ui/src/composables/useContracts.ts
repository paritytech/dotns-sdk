import {
  ContractManager,
  createContract,
  type AbiEntry,
  type CdmJson,
  type Contract,
  type ContractDef,
  type TxOptions,
} from "@parity/product-sdk-contracts";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import type { HexString, SS58String } from "polkadot-api";
import cdmJsonRaw from "../../cdm.json" with { type: "json" };
import { labelStoreAbi } from "@/lib/abis/labelStore";
import { getChainClient } from "@/composables/useTypedAPI";
import { useNetworkStore } from "@/store/useNetworkStore";
import { signerManager } from "@/store/useWalletStore";
import { ZERO_SUBSTRATE_ADDRESS } from "@/utils";

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

// `cdm install` (cdm 0.8.17) writes a target-bucketed manifest:
//   { targets: { <hash>: { registry } }, dependencies: { <hash>: {…} }, contracts: { <hash>: {…} } }
// ContractManager 0.7.x reads the flat shape ({ registry, dependencies, contracts }).
// Normalise at load by lifting the registry-bearing target to the top level —
// survives future `cdm install` runs without a post-process step.
type NestedCdm = {
  targets?: Record<string, { registry?: HexString }>;
  dependencies?: Record<string, CdmJson["dependencies"]>;
  contracts?: Record<string, CdmJson["contracts"]>;
};

function flattenCdm(raw: NestedCdm): CdmJson {
  const targetsMap = raw.targets;
  if (!targetsMap) return raw as unknown as CdmJson;
  const keys = Object.keys(targetsMap);
  const target = keys.find((k) => targetsMap[k]?.registry) ?? keys[0];
  if (!target) return raw as unknown as CdmJson;
  return {
    registry: targetsMap[target]?.registry,
    dependencies: raw.dependencies?.[target] ?? {},
    contracts: raw.contracts?.[target] ?? {},
  } as CdmJson;
}

const cdmJson = flattenCdm(cdmJsonRaw as unknown as NestedCdm);

// Per-user store proxies whose LOGIC ABI is not published to the CDM registry
// (only the StoreFactory + beacon are — see src/lib/abis/labelStore.ts). The
// proxy address is resolved at call time via StoreFactory; the ABI is vendored.
const PROXY_ABIS: Record<string, AbiEntry[]> = {
  "@dotns/label-store": labelStoreAbi,
};

let managerPromise: Promise<ContractManager> | null = null;

export async function getContractManager(): Promise<ContractManager> {
  if (!managerPromise) {
    managerPromise = (async () => {
      const chain = await getChainClient();
      // Live address resolution: contract addresses are pulled from the on-chain
      // CDM meta-registry (robust to redeploys), ABIs from the installed snapshot.
      // registryOrigin is the read-only dry-run origin for the registry lookup.
      return ContractManager.fromLiveClient(cdmJson, chain.raw.assetHub, paseo_asset_hub, {
        signerManager,
        registryOrigin: ZERO_SUBSTRATE_ADDRESS as SS58String,
      });
    })();
  }
  return managerPromise;
}

export async function getContract(library: string): Promise<Contract<ContractDef>> {
  const m = await getContractManager();
  return m.getContract(library);
}

// Per-user beacon proxies (LabelStore) — address resolved at call time via
// StoreFactory, ABI from PROXY_ABIS (vendored) or the cdm.json snapshot.
export async function getProxyContract(
  library: string,
  address: HexString,
): Promise<Contract<ContractDef>> {
  const m = await getContractManager();
  const abi = PROXY_ABIS[library] ?? getAbi(library);
  return createContract(m.getRuntime(), address, abi, { signerManager });
}

export function getAbi(library: string): AbiEntry[] {
  const entry = cdmJson.contracts?.[library];
  if (!entry) {
    throw new Error(`Library ${library} not in cdm.json`);
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
