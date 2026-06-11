import { decodeErrorResult, type Abi, type Hex } from "viem";
import cdmJsonRaw from "../../cdm.json" with { type: "json" };
import { nameEscrowAbi } from "./abis/nameEscrow";
import { labelStoreAbi } from "./abis/labelStore";
import { userStoreAbi } from "./abis/userStore";

type AbiErrorItem = { type: string; name?: string };

// Every dotns contract's error fragments, deduped, so a revert from any contract
// decodes to its ABI error name + args regardless of which one was called.
function collectErrorFragments(): Abi {
  const fragments = new Map<string, AbiErrorItem>();
  const add = (abi: readonly unknown[] | undefined): void => {
    for (const item of abi ?? []) {
      const fragment = item as AbiErrorItem;
      if (fragment.type === "error") fragments.set(JSON.stringify(fragment), fragment);
    }
  };

  const contracts = (
    cdmJsonRaw as { contracts?: Record<string, Record<string, { abi?: unknown[] }>> }
  ).contracts;
  for (const target of Object.values(contracts ?? {})) {
    for (const entry of Object.values(target)) add(entry.abi);
  }
  add(nameEscrowAbi);
  add(labelStoreAbi);
  add(userStoreAbi);

  return [...fragments.values()] as unknown as Abi;
}

const ERROR_ABI = collectErrorFragments();

// Decodes EVM revert data to a human-readable "ErrorName(arg, ...)" using the
// combined contract ABI, or null when the data is empty or the selector is unknown.
export function decodeRevertReason(data: Hex | undefined): string | null {
  if (!data || data === "0x") return null;
  try {
    const { errorName, args } = decodeErrorResult({ abi: ERROR_ABI, data });
    return args && args.length > 0 ? `${errorName}(${args.map(String).join(", ")})` : errorName;
  } catch {
    return null;
  }
}
