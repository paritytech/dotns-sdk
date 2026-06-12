import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import { isHex } from "viem";

export function countTrailingDigits(label: string): number {
  let count = 0;
  for (let characterIndex = label.length - 1; characterIndex >= 0; characterIndex--) {
    const asciiCode = label.charCodeAt(characterIndex);
    // ASCII codes 48-57 represent digits 0-9
    if (asciiCode >= 48 && asciiCode <= 57) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function stripTrailingDigits(label: string): string {
  return label.replace(/\d+$/, "");
}

// Normalise a name or `name.dot` to its bare lowercase label.
export function asLabel(name: string): string {
  const raw = name.trim().toLowerCase();
  return raw.endsWith(".dot") ? raw.slice(0, -4) : raw;
}

// A single canonical DNS label, mirroring the contract's StringUtils._isDnsLabel
// (PopRules._requireCanonicalLabel / registry subnode rules): lowercase ASCII
// letters, digits and hyphen only, no leading or trailing hyphen, length 1-63, no
// dots. Non-canonical labels revert on-chain, so reject them before submitting.
const CANONICAL_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isCanonicalLabel(label: string): boolean {
  return label.length > 0 && label.length <= 63 && CANONICAL_LABEL_REGEX.test(label);
}

export function validateCanonicalLabel(label: string, role = "label"): void {
  if (!isCanonicalLabel(label)) {
    throw new Error(
      `Invalid ${role}: must be a single label of lowercase letters, digits and hyphens (no dots, spaces or uppercase), 1-63 characters, not starting or ending with a hyphen`,
    );
  }
}

export function validateDomainLabel(label: string): void {
  if (!/^[a-z0-9-]{3,}$/.test(label)) {
    throw new Error(
      "Invalid domain label: must contain only lowercase letters, digits, and hyphens, with minimum length of 3 characters",
    );
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    throw new Error("Invalid domain label: cannot start or end with hyphen");
  }

  // PopRules accepts exactly zero or exactly two trailing digits. One, three, or more
  // are rejected outright. The two-digit lite-gateway suffix is the only digit shape
  // the protocol issues; allowing other counts would let users masquerade as gateway
  // names or create labels no class cleanly owns.
  const trailingDigitCount = countTrailingDigits(label);
  if (trailingDigitCount !== 0 && trailingDigitCount !== 2) {
    throw new Error(
      `Invalid domain label: must have either no trailing digits or exactly two, found ${trailingDigitCount}`,
    );
  }
}

export function validateGovernanceLabel(label: string): void {
  validateDomainLabel(label);

  const baseName = stripTrailingDigits(label);
  if (baseName.length > 5) {
    throw new Error(
      `Invalid governance label: base name must be 5 characters or fewer (got ${baseName.length})`,
    );
  }
}

export const isValidSubstrateAddress = (address: string, ss58Format = 42): boolean => {
  try {
    if (isHex(address)) return false;

    const decoded = decodeAddress(address);

    const checksummed = encodeAddress(decoded, ss58Format);

    return address === checksummed;
  } catch {
    return false;
  }
};
