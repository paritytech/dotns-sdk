// Personhood tiers a user can hold: NoStatus (0), PopLite (1), PopFull (2).
// Reserved is a name requirement, never a user tier, so it is excluded here.
export type PopTier = 0 | 1 | 2;

export type TransferFeeReason = "" | "below name tier" | "downgrade" | "reach + downgrade";

export type TransferFeeOutcome = {
  paysFloor: boolean;
  reason: TransferFeeReason;
};

// Mirrors PopRules.transferFloor: the floor is charged when the recipient does
// not meet the name's required tier (a reach miss) or is a lower tier than the
// sender (a downgrade). When the recipient clears both, the transfer is free.
export function transferFeeOutcome(
  requiredTier: PopTier,
  fromTier: PopTier,
  toTier: PopTier,
): TransferFeeOutcome {
  const reachMiss = toTier < requiredTier;
  const downgrade = toTier < fromTier;

  if (reachMiss && downgrade) return { paysFloor: true, reason: "reach + downgrade" };
  if (reachMiss) return { paysFloor: true, reason: "below name tier" };
  if (downgrade) return { paysFloor: true, reason: "downgrade" };
  return { paysFloor: false, reason: "" };
}
