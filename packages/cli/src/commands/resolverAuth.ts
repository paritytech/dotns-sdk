import { type Address, zeroAddress, checksumAddress } from "viem";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { CONTRACTS, DOTNS_REGISTRY_ABI, DOTNS_CONTENT_RESOLVER_ABI } from "../utils/constants";
import { performContractCall } from "../utils/contractInteractions";

export interface ResolverNodeInfo {
  exists: boolean;
  owner: Address;
  caller: Address;
}

export async function getResolverNodeInfo(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  namehashNode: string,
): Promise<ResolverNodeInfo> {
  const exists = await performContractCall<boolean>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "recordExists",
    [namehashNode],
  );

  const owner = await performContractCall<Address>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "owner",
    [namehashNode],
  );

  const caller = await clientWrapper.getEvmAddress(originSubstrateAddress);

  return { exists: exists && owner !== zeroAddress, owner, caller };
}

export async function requireResolverAuthorization(
  clientWrapper: ReviveClientWrapper,
  originSubstrateAddress: string,
  owner: Address,
  caller: Address,
): Promise<void> {
  const isOwner = checksumAddress(owner) === checksumAddress(caller);
  const isApproved = await performContractCall<boolean>(
    clientWrapper,
    originSubstrateAddress,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    DOTNS_CONTENT_RESOLVER_ABI,
    "isApprovedForAll",
    [owner, caller],
  );

  if (!isOwner && !isApproved) {
    throw new Error(`You do not own this domain. Owner is ${owner}, but you are ${caller}`);
  }
}
