// Ownership verification, via MultiCall3-backed batch reads.
//
// Batches DotnsRegistrar.ownerOf / DotnsRegistry.owner across all names in a
// profile into a single MultiCall3.aggregate3 dry-run (one chain round-trip
// instead of N). MultiCall3's address is resolved live from the on-chain CDM
// registry (via ContractManager.fromLiveClient in useContracts) — no hardcoded
// address, which is what silently broke this path on paseo-next-v2 before.
//
// The inner ownerOf/owner calldata is encoded with viem against the registrar/
// registry ABIs, and each Result.returnData is decoded the same way.
// `allowFailure: true` means a reverting ownerOf (nonexistent token) comes back
// as `{ success: false }` rather than bubbling — preserving the per-name default
// behaviour (2LD miss → not owned; subname miss → owned by default).

import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  namehash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  getAbi,
  getContract,
  getContractManager,
  withContractRecovery,
} from "@/composables/useContracts";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "@/utils";

function isSubname(value: string): boolean {
  const name = value.endsWith(".dot") ? value.slice(0, -4) : value;
  return name.includes(".");
}

export function useMulticallOwnership() {
  async function batchVerifyOwnership(
    names: string[],
    ownerAddress: Address,
  ): Promise<Map<string, boolean>> {
    if (names.length === 0) return new Map();

    return withContractRecovery(async () => {
      const checksummedOwner = getAddress(ownerAddress);
      const manager = await getContractManager();
      const multicall = await getContract("@dotns/multicall3");

      const registrarAddress = manager.getAddress("@dotns/registrar") as Address;
      const registryAddress = manager.getAddress("@dotns/registry") as Address;
      const registrarAbi = getAbi("@dotns/registrar");
      const registryAbi = getAbi("@dotns/registry");

      // Build one Call3 per name; remember each name's kind so the matching
      // result can be decoded and defaulted correctly.
      const plans: { name: string; subname: boolean }[] = [];
      const calls = names.map((name) => {
        if (isSubname(name)) {
          const fullName = name.endsWith(".dot") ? name : `${name}.dot`;
          plans.push({ name, subname: true });
          return {
            target: registryAddress,
            allowFailure: true,
            callData: encodeFunctionData({
              abi: registryAbi,
              functionName: "owner",
              args: [namehash(fullName)],
            }),
          };
        }
        const tokenId = computeDomainTokenId(normalizeDomainName(name));
        plans.push({ name, subname: false });
        return {
          target: registrarAddress,
          allowFailure: true,
          callData: encodeFunctionData({
            abi: registrarAbi,
            functionName: "ownerOf",
            args: [tokenId],
          }),
        };
      });

      const res = await multicall.aggregate3!.query(calls, { origin: ZERO_SUBSTRATE_ADDRESS });

      // Whole-aggregate failure (multicall itself unreachable): fall back to the
      // per-name defaults rather than throwing away the page.
      if (!res.success) {
        return new Map(plans.map((p) => [p.name, p.subname]));
      }

      const results = res.value as { success: boolean; returnData: Hex }[];
      const ownership = new Map<string, boolean>();

      results.forEach((result, i) => {
        const plan = plans[i]!;
        if (plan.subname) {
          // registry.owner: miss/failure → owned-by-default (true), else compare.
          if (!result.success) return ownership.set(plan.name, true);
          const owner = decodeFunctionResult({
            abi: registryAbi,
            functionName: "owner",
            data: result.returnData,
          }) as Address;
          ownership.set(
            plan.name,
            !owner || owner === zeroAddress ? true : getAddress(owner) === checksummedOwner,
          );
          return;
        }
        // registrar.ownerOf: miss/failure → not owned (false), else compare.
        if (!result.success) return ownership.set(plan.name, false);
        const owner = decodeFunctionResult({
          abi: registrarAbi,
          functionName: "ownerOf",
          data: result.returnData,
        }) as Address;
        ownership.set(
          plan.name,
          !owner || owner === zeroAddress ? false : getAddress(owner) === checksummedOwner,
        );
      });

      return ownership;
    });
  }

  return {
    batchVerifyOwnership,
    isSubname,
  };
}
