import { type Address, zeroAddress, checksumAddress } from "viem";
import { type DotnsContext, read, ownEvmAddress } from "../core/context";
import { DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";

export interface ResolverNodeInfo {
  exists: boolean;
  owner: Address;
  caller: Address;
}

export async function getResolverNodeInfo(
  ctx: DotnsContext,
  namehashNode: string,
): Promise<ResolverNodeInfo> {
  const exists = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "recordExists",
    [namehashNode],
  );

  const owner = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "owner",
    [namehashNode],
  );

  const caller = await ownEvmAddress(ctx);

  return { exists: exists && owner !== zeroAddress, owner, caller };
}

export async function requireResolverAuthorization(
  ctx: DotnsContext,
  owner: Address,
  caller: Address,
): Promise<void> {
  const isOwner = checksumAddress(owner) === checksumAddress(caller);
  const isApproved = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "isApprovedForAll",
    [owner, caller],
  );

  if (!isOwner && !isApproved) {
    throw new Error(`You do not own this domain. Owner is ${owner}, but you are ${caller}`);
  }
}
