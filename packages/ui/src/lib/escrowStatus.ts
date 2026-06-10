// Time-gated escrow rules kept pure and out of the component so they can be tested.

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
  if (!position.released) return "Held";
  return isWithdrawable(position, nowSeconds) ? "Withdrawable" : "Cooldown";
}

export function isRefundClaimable(entry: RefundState, nowSeconds: bigint): boolean {
  return entry.availableAt <= nowSeconds;
}
