import { type Address } from "viem";
import { type DotnsContext, read, write } from "../core/context";
import { DOTNS_NAME_ESCROW_ABI, DOTNS_REGISTRAR_ABI } from "../utils/constants";
import { computeDomainTokenId } from "../utils/contractInteractions";
import { normaliseLabel } from "../utils/validation";
import { isSameEvmAddress } from "../utils/address";

/// On-chain release position for a token.
export type EscrowPositionView = {
  domain: string;
  tokenId: bigint;
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

export type RefundEntryView = {
  entryId: bigint;
  recipient: Address;
  amount: bigint;
  availableAt: bigint;
  tokenId: bigint;
};

export type RefundsListResult = {
  recipient: Address;
  total: bigint;
  page: {
    offset: number;
    limit: number;
  };
  entries: RefundEntryView[];
};

type RawReleasePosition = {
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

type RawRefundEntry = {
  recipient: Address;
  amount: bigint;
  availableAt: bigint;
  tokenId: bigint;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

/// Reads one release position by name. Returns null when the slot is empty.
async function readPositionForName(
  ctx: DotnsContext,
  name: string,
): Promise<EscrowPositionView | null> {
  const label = normaliseLabel(name);
  const tokenId = computeDomainTokenId(label);

  const raw = await read<RawReleasePosition>(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "getReleasePosition",
    [tokenId],
  );

  if (raw.recipient === ZERO_ADDRESS && raw.amount === 0n && !raw.released) {
    return null;
  }

  return {
    domain: label,
    tokenId,
    recipient: raw.recipient,
    asset: raw.asset,
    amount: raw.amount,
    withdrawAvailableAt: raw.withdrawAvailableAt,
    released: raw.released,
    claimed: raw.claimed,
  };
}

/// Reads the current release position for a name. Returns null when the slot is empty.
export async function getEscrowPosition(
  ctx: DotnsContext,
  label: string,
): Promise<EscrowPositionView | null> {
  return readPositionForName(ctx, label);
}

/// All release positions belonging to `recipient`, across the names they hold. Labels
/// are mirror-on-transfer and never deleted, so a released name still resolves through
/// the caller's own label set; the recipient filter drops names transferred away.
export async function listEscrowPositions(
  ctx: DotnsContext,
  recipient: Address,
  names: string[],
): Promise<EscrowPositionView[]> {
  const positions: EscrowPositionView[] = [];
  for (const name of names) {
    const position = await readPositionForName(ctx, name).catch(() => null);
    if (
      position !== null &&
      isSameEvmAddress(position.recipient, recipient) &&
      isRefundableDeposit(position)
    ) {
      positions.push(position);
    }
  }
  return positions;
}

/// A position is the user's escrow deposit only while it holds a refundable amount. Zero-amount
/// entries are PopFull/PopLite lifecycle markers or already-withdrawn slots, not staked deposits.
export function isRefundableDeposit(position: { amount: bigint }): boolean {
  return position.amount > 0n;
}

/// Total still locked across positions. Withdrawn positions carry amount 0 (the contract
/// zeroes it on withdraw), so they fall out of the sum naturally.
export function totalEscrowAmount(positions: readonly { amount: bigint }[]): bigint {
  return positions.reduce((sum, position) => sum + position.amount, 0n);
}

/// Seconds left on a released position's cooldown before it becomes withdrawable.
export function cooldownRemainingSeconds(
  position: Pick<EscrowPositionView, "withdrawAvailableAt">,
  nowSeconds: bigint,
): bigint {
  const remaining = position.withdrawAvailableAt - nowSeconds;
  return remaining > 0n ? remaining : 0n;
}

export function formatCooldown(seconds: bigint): string {
  if (seconds <= 0n) return "0s";
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/// Plain status text for a position, embedding the live cooldown countdown while a
/// released name waits out its cooldown.
export function formatPositionStatus(position: EscrowPositionView, nowSeconds: bigint): string {
  if (position.claimed) return "claimed";
  if (!position.released) return "held";
  const remaining = cooldownRemainingSeconds(position, nowSeconds);
  return remaining > 0n ? `cooldown ${formatCooldown(remaining)}` : "claimable";
}

/// Reads the caller's pull-payment ledger balance (withdrawn deposits plus
/// registration-overpayment refunds). This is what `claimWithdrawal` drains and is
/// independent of any open release position.
export async function getPendingWithdrawal(ctx: DotnsContext, recipient: Address): Promise<bigint> {
  return read<bigint>(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingWithdrawal",
    [recipient],
  );
}

/// Approves the escrow on the registrar then calls `release`. The caller must own the NFT.
export async function releaseName(
  ctx: DotnsContext,
  label: string,
): Promise<{ approveTxHash: string; releaseTxHash: string; tokenId: bigint }> {
  const tokenId = computeDomainTokenId(normaliseLabel(label));

  const approveTxHash = await write(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR,
    0n,
    DOTNS_REGISTRAR_ABI,
    "approve",
    [ctx.contracts.DOTNS_NAME_ESCROW, tokenId],
    "Approve escrow",
  );

  const releaseTxHash = await write(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "release",
    [tokenId],
    "Release",
  );

  return { approveTxHash, releaseTxHash, tokenId };
}

/// Calls `withdraw` to credit the original depositor's pull-payment balance. Reverts before
/// the per-position cooldown elapses.
export async function withdrawName(ctx: DotnsContext, label: string): Promise<string> {
  const tokenId = computeDomainTokenId(normaliseLabel(label));
  return write(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "withdraw",
    [tokenId],
    "Withdraw",
  );
}

/// Drains the legacy pull-payment ledger that holds registration-overpayment fallbacks. The
/// caller receives the amount accumulated against their address.
export async function claimWithdrawal(ctx: DotnsContext): Promise<string> {
  return write(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimWithdrawal",
    [],
    "Claim withdrawal",
  );
}

/// Reads the caller's pending refund ledger entries within a paginated window.
export async function listRefunds(
  ctx: DotnsContext,
  recipient: Address,
  offset: number,
  limit: number,
): Promise<RefundsListResult> {
  const total = await read<bigint>(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingRefundCount",
    [recipient],
  );

  // pendingRefunds has two outputs, so the call decodes to a [ids, entries] tuple.
  const [ids, entries] = await read<[bigint[], RawRefundEntry[]]>(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    DOTNS_NAME_ESCROW_ABI,
    "pendingRefunds",
    [recipient, BigInt(offset), BigInt(limit)],
  );

  return {
    recipient,
    total,
    page: { offset, limit },
    entries: entries.map((entry, index) => ({
      entryId: ids[index] ?? 0n,
      recipient: entry.recipient,
      amount: entry.amount,
      availableAt: entry.availableAt,
      tokenId: entry.tokenId,
    })),
  };
}

/// Claims a single refund-ledger entry. Reverts before its independent cooldown elapses.
export async function claimRefund(ctx: DotnsContext, entryId: bigint): Promise<string> {
  return write(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimRefund",
    [entryId],
    "Claim refund",
  );
}

/// Batched single-call claim for several entries. Each entry's cooldown is checked
/// independently; the call reverts atomically if any one entry is still locked.
export async function claimRefundsBatch(ctx: DotnsContext, entryIds: bigint[]): Promise<string> {
  return write(
    ctx,
    ctx.contracts.DOTNS_NAME_ESCROW,
    0n,
    DOTNS_NAME_ESCROW_ABI,
    "claimRefundsBatch",
    [entryIds],
    "Claim refunds (batch)",
  );
}
