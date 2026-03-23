import { normalize } from "viem/ens";
import { PopStatus } from "@/type";

/**
 * Domain Name Utilities
 *
 * Functions for validating, normalizing, and working with domain names
 */

const DOT_NAME_REGEX =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.dot$/;

export const SPECIAL_CHAR_REGEX = /[&^%$*+~=`{}|\\<>\/\[\]"]+/;

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
 * Filter an array to only include valid .dot domain names
 *
 * @param values - Array of values to filter
 * @returns Array of valid .dot domain names
 */
export function filterDotNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;

    const name = value.trim().toLowerCase();
    if (!name) continue;
    if (!name.endsWith(".dot")) continue;
    if (!DOT_NAME_REGEX.test(name)) continue;

    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }

  return out;
}

/**
 * Check if a label can be registered with the given PoP status
 *
 * @param label - Domain label
 * @param state - User's PoP status
 * @returns True if registration is allowed
 */
export function canRegisterWithStatus(label: string, state: PopStatus | null): boolean {
  return state !== null && label.trim().length > 0 && state !== PopStatus.Reserved;
}

/**
 * Extract bytes from a contract result
 *
 * @param result - Contract call result
 * @returns Extracted bytes as Uint8Array, string, or null
 */
export function extractBytes(result: any): Uint8Array | string | null {
  if (!result) return null;

  const core =
    result.result ??
    result.ok ??
    result.asOk ??
    (Array.isArray(result) ? result[1] : null) ??
    result;

  if (!core) return null;

  if (core.isOk && core.asOk) return unwrap(core.asOk);
  if (core.ok) return unwrap(core.ok);

  if (core.toHuman) {
    const human = core.toHuman();
    const v = human?.Ok ?? human?.ok;
    if (typeof v === "string") return v;
  }

  return unwrap(core);
}

/**
 * Unwrap a value to Uint8Array or string
 *
 * @param v - Value to unwrap
 * @returns Unwrapped value or null
 */
export function unwrap(v: any): Uint8Array | string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return v;
  if (v.toU8a) return v.toU8a();
  return null;
}
