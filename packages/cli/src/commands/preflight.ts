import type { Address } from "viem";
import { isSameEvmAddress } from "../utils/address";
import { formatUnixSeconds } from "../utils/formatting";
import type { NameInspection } from "./inspectName";

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

/// The requires of DotnsNameEscrow.release: a position exists, is not yet released, and
/// belongs to the signer.
export function assertReleasable(n: NameInspection, signer: Address, nowSeconds: bigint): void {
  if (n.position === null) {
    throw new Error(
      `Cannot release: ${n.domain} has no escrow position. Only names registered through the public registrar carry one; names granted from the whitelist cannot be released.`,
    );
  }
  if (n.position.released) {
    const until = formatUnixSeconds(n.position.redeemableUntil);
    const phase =
      nowSeconds < n.position.redeemableUntil
        ? `redeemable by the previous holder until ${until}`
        : `its redeem window closed at ${until}, so anyone may register it`;
    throw new Error(`Cannot release: ${n.domain} is already released; ${phase}.`);
  }
  if (!isSameEvmAddress(n.position.recipient, signer)) {
    throw new Error(
      `Cannot release: ${n.domain} is held by ${n.position.recipient}, not by the signing account ${signer}.`,
    );
  }
}

/// The requires of DotnsNameEscrow.redeem, which the contract folds into one NotRedeemable
/// revert: released, signer is the previous holder, window still open, deposit not withdrawn.
export function assertRedeemable(n: NameInspection, signer: Address, nowSeconds: bigint): void {
  if (n.position === null || !n.position.released) {
    throw new Error(`Cannot redeem: ${n.domain} is not released.`);
  }
  if (!isSameEvmAddress(n.position.recipient, signer)) {
    throw new Error(
      `Cannot redeem: only the previous holder ${n.position.recipient} may redeem ${n.domain}; the signing account is ${signer}.`,
    );
  }
  const until = formatUnixSeconds(n.position.redeemableUntil);
  if (nowSeconds >= n.position.redeemableUntil) {
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
