// ----------------------------------------------------------------------------
// Ownership verification — formerly MultiCall3-backed
//
// Originally batched DotnsRegistrar.ownerOf / DotnsRegistry.owner calls via
// MultiCall3.aggregate3 at the address shared with packages/cli
// (0x807A65D3F3020011Fe0A61723d51362556C14ffd). On the paseo-next-v2
// migration we discovered that address has no contract code (dry-runs return
// empty bytes with no revert flag — the EVM signature of calling an EOA or
// destroyed contract), which silently broke ownership verification on the
// profile page. The address isn't on the authoritative v2 contract list and
// MultiCall3 doesn't appear to be deployed on paseo-next-v2 anywhere we
// could find.
//
// Rather than pin an unverified address, this composable now does N parallel
// ContractManager queries via Promise.all. The host's PAPI provider
// multiplexes them over the same MessagePort so the perceived latency for
// typical profile sizes (<50 names) is indistinguishable from the batched
// path. It also removes one off-list dependency from the cdm.json manifest.
//
// To re-enable MultiCall3 batching when/if it lands on paseo-next-v2:
//   1. Add `multicall3` (or `@multicall/v3`) back to packages/ui/scripts/build-cdm.ts
//      with the new chain address, regenerate cdm.json
//   2. Restore the prior aggregate3-based batchVerifyOwnership body from
//      git history (commit predating this file's MultiCall removal)
//   3. Update the resolver's multi-record write path (useResolverStore) the
//      same way — it also uses MultiCall.aggregate but is currently broken
//      in the same silent way
// ----------------------------------------------------------------------------

import { namehash, getAddress, zeroAddress, type Address } from "viem";
import { getContract, withContractRecovery } from "@/composables/useContracts";
import { computeDomainTokenId, normalizeDomainName, ZERO_SUBSTRATE_ADDRESS } from "@/utils";

function isSubname(value: string): boolean {
  const name = value.endsWith(".dot") ? value.slice(0, -4) : value;
  return name.includes(".");
}

export function useMulticallOwnership() {
  async function checkOne(
    name: string,
    checksummedOwner: Address,
    registrar: Awaited<ReturnType<typeof getContract>>,
    registry: Awaited<ReturnType<typeof getContract>>,
  ): Promise<[string, boolean]> {
    try {
      if (isSubname(name)) {
        const fullName = name.endsWith(".dot") ? name : `${name}.dot`;
        const r = await registry.owner!.query(namehash(fullName), {
          origin: ZERO_SUBSTRATE_ADDRESS,
        });
        // Subnames default to true when the registry has no record — preserves
        // the prior MultiCall implementation's behavior (decoded zeroAddress for
        // subname call → ownershipMap.set(name, true)).
        if (!r.success) return [name, true];
        const owner = r.value as Address;
        if (!owner || owner === zeroAddress) return [name, true];
        return [name, getAddress(owner) === checksummedOwner];
      }

      const tokenId = computeDomainTokenId(normalizeDomainName(name));
      const r = await registrar.ownerOf!.query(tokenId, { origin: ZERO_SUBSTRATE_ADDRESS });
      if (!r.success) return [name, false];
      const owner = r.value as Address;
      if (!owner || owner === zeroAddress) return [name, false];
      return [name, getAddress(owner) === checksummedOwner];
    } catch {
      return [name, false];
    }
  }

  async function batchVerifyOwnership(
    names: string[],
    ownerAddress: Address,
  ): Promise<Map<string, boolean>> {
    if (names.length === 0) return new Map();

    return withContractRecovery(async () => {
      const checksummedOwner = getAddress(ownerAddress);
      const [registrar, registry] = await Promise.all([
        getContract("@dotns/registrar"),
        getContract("@dotns/registry"),
      ]);

      const entries = await Promise.all(
        names.map((name) => checkOne(name, checksummedOwner, registrar, registry)),
      );
      return new Map(entries);
    });
  }

  return {
    batchVerifyOwnership,
    isSubname,
  };
}
