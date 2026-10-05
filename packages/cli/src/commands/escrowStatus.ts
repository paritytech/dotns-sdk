import type { ReleasePosition } from "./inspectName";
import { formatUnixSeconds } from "../utils/formatting";

/// Time-gated escrow rules kept pure, with no chain access, so the commands, the display
/// layer and the preflight asserts all read one definition of each state.

/// A position is the user's escrow deposit only while it holds a refundable amount. Zero-amount
/// entries are PopFull/PopLite lifecycle markers or already-withdrawn slots, not staked deposits.
export function isRefundableDeposit(position: Pick<ReleasePosition, "amount">): boolean {
  return position.amount > 0n;
}

/// Total still locked across positions. Withdrawn positions carry amount 0 (the contract
/// zeroes it on withdraw), so they fall out of the sum naturally.
export function totalEscrowAmount(positions: readonly Pick<ReleasePosition, "amount">[]): bigint {
  return positions.reduce((sum, position) => sum + position.amount, 0n);
}

/// Seconds left on a released position's cooldown before it becomes withdrawable.
export function cooldownRemainingSeconds(
  position: Pick<ReleasePosition, "withdrawAvailableAt">,
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
export function formatPositionStatus(position: ReleasePosition, nowSeconds: bigint): string {
  if (position.claimed) return "claimed";
  if (!position.released) return "held";
  const remaining = cooldownRemainingSeconds(position, nowSeconds);
  return remaining > 0n ? `cooldown ${formatCooldown(remaining)}` : "claimable";
}

export type ReleasePhase = "held" | "redeemable" | "awaiting" | "reclaimable";

/// The escrow's own predicates: `redeem` needs `released && !claimed && now < redeemableUntil`,
/// `isReclaimable` is `released && now >= redeemableUntil`. "awaiting" is the gap where the
/// holder withdrew the deposit inside the window, forfeiting redemption, and nobody can act yet.
export function releasePhase(position: ReleasePosition, nowSeconds: bigint): ReleasePhase {
  if (!position.released) return "held";
  if (nowSeconds >= position.redeemableUntil) return "reclaimable";
  return position.claimed ? "awaiting" : "redeemable";
}

/// One line naming the phase and, when a clock decides it, the time it changes.
export function formatReleasePhase(position: ReleasePosition, nowSeconds: bigint): string {
  const until = formatUnixSeconds(position.redeemableUntil);
  switch (releasePhase(position, nowSeconds)) {
    case "held":
      return "held; not released";
    case "redeemable":
      return `released; redeemable by the previous holder until ${until}, then reclaimable by anyone`;
    case "awaiting":
      return `released; deposit withdrawn so no longer redeemable; reclaimable by anyone from ${until}`;
    case "reclaimable":
      return `released; redeem window closed at ${until}; reclaimable by anyone through registration`;
  }
}
