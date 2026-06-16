import { normalize } from "viem/ens";

/**
 * Domain Name Utilities
 *
 * Functions for validating, normalizing, and working with domain names
 */

export const SPECIAL_CHAR_REGEX = /[&^%$*+~=`{}|\\<>\/\[\]"]+/;

// A single canonical DNS label, mirroring the contract's StringUtils._isDnsLabel
// (PopRules._requireCanonicalLabel): lowercase ASCII letters, digits and hyphen
// only, no leading or trailing hyphen, length 1-63, and no dots. Names that fail
// this revert at classify/register, so the UI must reject them up front.
const CANONICAL_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isCanonicalLabel(label: string): boolean {
  return label.length > 0 && label.length <= 63 && CANONICAL_LABEL_REGEX.test(label);
}

/**
 * Validate an ENS/dotNS label
 *
 * @param label - Label to validate
 * @param minLabelLength - Minimum length (default: 3)
 * @param maxLabelLength - Maximum length (default: 63)
 * @returns Normalized label
 * @throws Error if validation fails
 */
export function validateENSName(label: string, minLabelLength = 3, maxLabelLength = 63): string {
  if (!label || typeof label !== "string") {
    throw new Error("Label must be a non-empty string");
  }

  const normalized = normalize(label);

  if (normalized.length < minLabelLength) {
    throw new Error(`Label too short: minimum is ${minLabelLength}, got ${normalized.length}`);
  }
  if (normalized.length > maxLabelLength) {
    throw new Error(`Label too long: maximum is ${maxLabelLength}, got ${normalized.length}`);
  }

  if (normalized.startsWith("-") || normalized.endsWith("-")) {
    throw new Error("Label must not start or end with a hyphen");
  }
  if (normalized.length >= 4 && normalized.slice(2, 4) === "--") {
    throw new Error("Label must not contain '--' at position 3–4");
  }

  if (SPECIAL_CHAR_REGEX.test(normalized)) {
    throw new Error("Label contains disallowed special characters");
  }

  const asciiAllowedRegex = /^[a-z0-9\-]+$/;
  if (!asciiAllowedRegex.test(normalized)) {
    throw new Error(
      "Label contains characters outside allowed ASCII (a-z, 0-9, hyphen) or allowed Unicode",
    );
  }

  return normalized;
}

/**
 * Normalize a domain name by removing the .dot suffix
 *
 * @param name - Domain name to normalize
 * @returns Normalized name without .dot suffix
 */
export function normalizeDomainName(name: string): string {
  return name.replace(/\.dot$/, "");
}

/**
 * Compare two .dot names for equality, ignoring case, surrounding whitespace,
 * and an optional trailing .dot suffix.
 *
 * @returns false if either name is empty/missing
 */
export function isSameDotName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const strip = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/\.dot$/, "");
  return strip(a) === strip(b);
}

/**
 * True for a registrable second-level name (one label under .dot, e.g. "alice"
 * or "alice.dot"), false for subdomains ("sub.alice") or empty input. Only these
 * names can hold an escrow deposit, so it filters which names are worth a
 * position lookup.
 */
export function isRegistrableDotName(name: string): boolean {
  return normalizeDomainName(name.trim().toLowerCase()).split(".").filter(Boolean).length === 1;
}
