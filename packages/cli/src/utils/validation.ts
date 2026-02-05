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

export function validateDomainLabel(label: string): void {
  if (!/^[a-z0-9-]{3,}$/.test(label)) {
    throw new Error(
      "Invalid domain label: must contain only lowercase letters, digits, and hyphens, with minimum length of 3 characters",
    );
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    throw new Error("Invalid domain label: cannot start or end with hyphen");
  }

  const trailingDigitCount = countTrailingDigits(label);
  if (trailingDigitCount > 2) {
    throw new Error(
      `Invalid domain label: maximum 2 trailing digits allowed, found ${trailingDigitCount}`,
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
