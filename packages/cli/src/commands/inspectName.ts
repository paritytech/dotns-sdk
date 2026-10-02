import { zeroAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read } from "../core/context";
import { DOTNS_NAME_ESCROW_ABI, DOTNS_REGISTRAR_ABI, DOTNS_REGISTRY_ABI } from "../utils/constants";
import { domainNode, formatDomainName, normaliseName } from "../core/naming";

/// The escrow's ReleasePosition struct as `getReleasePosition` returns it.
export type ReleasePosition = {
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  redeemableUntil: bigint;
  released: boolean;
  claimed: boolean;
};

/// Everything the contracts publish about a name that decides which operations they will
/// accept. Commands that would otherwise learn the answer from a revert after the user has
/// signed read this first and refuse, or warn, with the reason.
export type NameInspection = {
  label: string;
  domain: string;
  node: Hex;
  tokenId: bigint;
  /// Whether the registry holds a record for the node; true for tokens and subnames alike.
  registered: boolean;
  /// The registrar's `ownerOf`, the address `approve` and `transferFrom` check; null when no
  /// token exists.
  owner: Address | null;
  /// Whether the registrar minted a token for this node. Only second-level names have one;
  /// subnames, including device names, are registry records only
  /// and so cannot be transferred, delegated or released.
  hasToken: boolean;
  /// Names minted through the gateway pallet are soulbound: the registrar reverts every custody move
  /// (transfer, release into escrow) while still accepting `approve`.
  soulbound: boolean;
  /// The escrow's release position, or null when the slot is empty. Only names registered
  /// through the public registrar controller carry one.
  position: ReleasePosition | null;
};

function isEmptyPosition(position: ReleasePosition): boolean {
  return position.recipient === zeroAddress && position.amount === 0n && !position.released;
}

/// Any failure aborts, so a wrong "not soulbound" can never precede release's approve.
async function readSoulbound(ctx: DotnsContext, tokenId: bigint): Promise<boolean> {
  return read<boolean>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "isSoulbound", [
    tokenId,
  ]);
}

/// Reads the facts about `name` in one pass. `name` may be a bare label or fully qualified.
export async function inspectName(ctx: DotnsContext, name: string): Promise<NameInspection> {
  const label = await normaliseName(ctx, name);
  const node = await domainNode(ctx, label);
  const tokenId = BigInt(node);

  const [domain, registered, hasToken, position] = await Promise.all([
    formatDomainName(ctx, label),
    read<boolean>(ctx, ctx.contracts.DOTNS_REGISTRY, DOTNS_REGISTRY_ABI, "recordExists", [node]),
    read<boolean>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "exists", [tokenId]),
    read<ReleasePosition>(
      ctx,
      ctx.contracts.DOTNS_NAME_ESCROW,
      DOTNS_NAME_ESCROW_ABI,
      "getReleasePosition",
      [tokenId],
    ),
  ]);
  // `ownerOf` reverts on a node with no token, so both registrar reads wait on `exists`.
  const [owner, soulbound] = hasToken
    ? await Promise.all([
        read<Address>(ctx, ctx.contracts.DOTNS_REGISTRAR, DOTNS_REGISTRAR_ABI, "ownerOf", [
          tokenId,
        ]),
        readSoulbound(ctx, tokenId),
      ])
    : [null, false];

  return {
    label,
    domain,
    node,
    tokenId,
    registered,
    owner,
    hasToken,
    soulbound,
    position: isEmptyPosition(position) ? null : position,
  };
}

export function formatUnixSeconds(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString();
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}
