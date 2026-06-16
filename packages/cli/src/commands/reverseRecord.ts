import type { Address } from "viem";
import { type DotnsContext, read, write, ownEvmAddress } from "../core/context";
import { DOTNS_REVERSE_RESOLVER_ABI } from "../utils/constants";
import { validateDomainLabel, normaliseLabel } from "../utils/validation";

export type PrimaryNameResult = {
  name: string;
  txHash: string;
};

export async function setPrimaryName(ctx: DotnsContext, name: string): Promise<PrimaryNameResult> {
  const label = normaliseLabel(name);
  validateDomainLabel(label);
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REVERSE_RESOLVER,
    0n,
    DOTNS_REVERSE_RESOLVER_ABI,
    "claimReverseRecord",
    [label],
    "Setting primary name",
  );
  return { name: `${label}.dot`, txHash };
}

export async function getPrimaryName(ctx: DotnsContext, address?: Address): Promise<string | null> {
  const target = address ?? (await ownEvmAddress(ctx));
  const name = await read<string>(
    ctx,
    ctx.contracts.DOTNS_REVERSE_RESOLVER,
    DOTNS_REVERSE_RESOLVER_ABI,
    "nameOf",
    [target],
  );
  return name && name.length > 0 ? name : null;
}
