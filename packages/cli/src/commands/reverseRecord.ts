import type { Address } from "viem";
import { type DotnsContext, read, write, ownEvmAddress } from "../core/context";
import { DOTNS_REVERSE_RESOLVER_ABI } from "../utils/constants";
import { validateExistingNameLabel } from "../utils/validation";
import { formatDomainName, normaliseName } from "../core/naming";

export type PrimaryNameResult = {
  name: string;
  txHash: string;
};

export async function setPrimaryName(ctx: DotnsContext, name: string): Promise<PrimaryNameResult> {
  const label = await normaliseName(ctx, name);
  validateExistingNameLabel(label);
  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_REVERSE_RESOLVER,
    0n,
    DOTNS_REVERSE_RESOLVER_ABI,
    "claimReverseRecord",
    [label],
    "Setting primary name",
  );
  return { name: await formatDomainName(ctx, label), txHash };
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
