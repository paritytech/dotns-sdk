import type { Address } from "viem";
import { isSameEvmAddress } from "../utils/address";
import {
  formatUnixSeconds,
  nowSeconds,
  type NameInspection,
  type ReleasePosition,
} from "./inspectName";

/// Rules a command checks against an inspection before submitting a write. Each mirrors the
/// contract's own `require` so the user gets the reason instead of a decoded revert.

export type NameAction = "release" | "transfer" | "delegate";

export function assertRegistered(n: NameInspection, verb: NameAction): void {
  if (!n.registered) throw new Error(`Cannot ${verb}: ${n.domain} is not registered.`);
}

export function assertIsOwner(n: NameInspection, signer: Address, verb: NameAction): void {
  if (n.owner === null || !isSameEvmAddress(n.owner, signer)) {
    throw new Error(
      `Cannot ${verb}: ${n.domain} is owned by ${n.owner ?? "nobody"}, not by the signing account ${signer}.`,
    );
  }
}

/// Subnames, including lite personhood names, are registry records with no registrar token.
export function assertIsToken(n: NameInspection, verb: NameAction): void {
  if (!n.hasToken) {
    throw new Error(
      `Cannot ${verb}: ${n.domain} is a subname, not a registrar token; lite personhood names and subnames have no token to ${verb}.`,
    );
  }
}

/// The registrar reverts every custody move of a soulbound name but still accepts `approve`.
export function assertNotSoulbound(n: NameInspection, verb: NameAction): void {
  if (n.soulbound) {
    throw new Error(`Cannot ${verb}: ${n.domain} is a soulbound personhood name.`);
  }
}

export type ReleasePhase = "held" | "redeemable" | "awaiting" | "reclaimable";

type ReleasePhaseFields = Pick<ReleasePosition, "released" | "claimed" | "redeemableUntil">;

/// The escrow's own predicates: `redeem` needs `released && !claimed && now < redeemableUntil`,
/// `isReclaimable` is `released && now >= redeemableUntil`. "awaiting" is the gap where the
/// holder withdrew the deposit inside the window, forfeiting redemption, and nobody can act yet.
export function releasePhase(position: ReleasePhaseFields, nowSeconds: bigint): ReleasePhase {
  if (!position.released) return "held";
  if (nowSeconds >= position.redeemableUntil) return "reclaimable";
  return position.claimed ? "awaiting" : "redeemable";
}

/// The phase and, where it changes on a clock, when.
export function formatReleasePhase(position: ReleasePhaseFields, nowSeconds: bigint): string {
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

/// The requires of DotnsNameEscrow.release: a position exists, is not yet released, and
/// belongs to the signer.
export function assertReleasable(n: NameInspection, signer: Address): void {
  if (n.position === null) {
    throw new Error(
      `Cannot release: ${n.domain} has no escrow position. Only names registered through the public registrar carry one; names granted from the whitelist cannot be released.`,
    );
  }
  if (n.position.released) {
    throw new Error(
      `Cannot release: ${n.domain} is already ${formatReleasePhase(n.position, nowSeconds())}.`,
    );
  }
  if (!isSameEvmAddress(n.position.recipient, signer)) {
    throw new Error(
      `Cannot release: ${n.domain} is held by ${n.position.recipient}, not by the signing account ${signer}.`,
    );
  }
}

/// The requires of DotnsNameEscrow.redeem, which the contract folds into one NotRedeemable
/// revert: released, signer is the previous holder, window still open, deposit not withdrawn.
export function assertRedeemable(n: NameInspection, signer: Address): void {
  if (n.position === null || !n.position.released) {
    throw new Error(`Cannot redeem: ${n.domain} is not released.`);
  }
  if (!isSameEvmAddress(n.position.recipient, signer)) {
    throw new Error(
      `Cannot redeem: only the previous holder ${n.position.recipient} may redeem ${n.domain}; the signing account is ${signer}.`,
    );
  }
  const until = formatUnixSeconds(n.position.redeemableUntil);
  if (nowSeconds() >= n.position.redeemableUntil) {
    throw new Error(
      `Cannot redeem: the redeem window on ${n.domain} closed at ${until}; the name is now reclaimable by anyone through registration.`,
    );
  }
  if (n.position.claimed) {
    throw new Error(
      `Cannot redeem: the deposit on ${n.domain} was already withdrawn, which forfeits redemption; the name becomes reclaimable by anyone at ${until}.`,
    );
  }
}

/// A released name stays reserved for its previous holder through the redeem window.
export function explainUnavailable(n: NameInspection): string {
  if (n.position?.released) {
    return `${n.domain} was released and is reserved for its previous holder until ${formatUnixSeconds(n.position.redeemableUntil)}; registration opens once that redeem window closes.`;
  }
  return `${n.domain} is already registered.`;
}
