// Time-gated escrow rules kept pure and out of the component so they can be tested.
import { isSameEvmAddress } from "./address";

export type ReleaseState = {
  amount: bigint;
  withdrawAvailableAt: bigint;
  released: boolean;
  claimed: boolean;
};

export type RefundState = {
  availableAt: bigint;
};

export function isWithdrawable(position: ReleaseState, nowSeconds: bigint): boolean {
  return position.released && !position.claimed && position.withdrawAvailableAt <= nowSeconds;
}

export function positionStatusLabel(position: ReleaseState, nowSeconds: bigint): string {
  if (position.claimed) return "Claimed";
  if (!position.released && !isRefundableDeposit(position)) return "Not refundable";
  if (!position.released) return "Held";
  return isWithdrawable(position, nowSeconds) ? "Withdrawable" : "Cooldown";
}

export function isRefundClaimable(entry: RefundState, nowSeconds: bigint): boolean {
  return entry.availableAt <= nowSeconds;
}

// A position is the user's escrow deposit only while it holds a refundable amount.
// Zero-amount entries are PopFull/PopLite lifecycle markers or already-withdrawn
// slots, not deposits the user has staked.
export function isRefundableDeposit(position: { amount: bigint }): boolean {
  return position.amount > 0n;
}

// A read position belongs to `recipient` when the escrow names them as the refund
// recipient, regardless of the staked amount. A null read (missing or failed) never
// qualifies. Zero-amount positions are kept so the UI can surface non-refundable
// names (paid for by another account, or registered under a free personhood tier)
// with a warning rather than hiding them; refundability is a display concern decided
// by isRefundableDeposit, not a discovery filter.
export function isAccountPosition<T extends { recipient: string }>(
  position: T | null,
  recipient: string,
): position is T {
  return position !== null && isSameEvmAddress(position.recipient, recipient);
}

// Total still locked across positions. Withdrawn positions carry amount 0 (the
// contract zeroes it on withdraw), so they fall out of the sum naturally.
export function totalEscrowAmount(positions: readonly { amount: bigint }[]): bigint {
  return positions.reduce((sum, position) => sum + position.amount, 0n);
}

// Seconds left on a released position's cooldown before it becomes withdrawable.
export function cooldownRemainingSeconds(position: ReleaseState, nowSeconds: bigint): bigint {
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
