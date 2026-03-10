import { computed, type Ref, type ComputedRef } from "vue";
import { normalizeDomainName as utilNormalizeDomain } from "@/utils";

export interface DomainValidationResult {
  /** The normalized domain name (without .dot suffix) */
  normalized: ComputedRef<string>;
  /** The domain with .dot suffix ensured */
  withDot: ComputedRef<string>;
  /** The domain without .dot suffix */
  withoutDot: ComputedRef<string>;
  /** Whether the domain has .dot suffix */
  hasDotSuffix: ComputedRef<boolean>;
  /** Truncated version for display (if too long) */
  truncated: ComputedRef<string>;
}

export interface UseDomainValidationOptions {
  /** Maximum length before truncation (default: 45) */
  maxLength?: number;
  /** Whether to automatically add .dot suffix if missing (default: false) */
  autoAddDot?: boolean;
}

/**
 * Composable for domain name validation and normalization.
 *
 * Provides utilities for:
 * - Normalizing domain names (removing .dot suffix)
 * - Ensuring .dot suffix is present
 * - Truncating long domain names for display
 * - Checking domain format
 *
 * @param domain - Reactive domain string
 * @param options - Optional configuration
 * @returns Domain validation utilities
 */
export function useDomainValidation(
  domain: Ref<string>,
  options: UseDomainValidationOptions = {},
): DomainValidationResult {
  const { maxLength = 45, autoAddDot = false } = options;

  // Normalized domain (without .dot suffix)
  const normalized = computed(() => {
    if (!domain.value) return "";
    return utilNormalizeDomain(domain.value);
  });

  // Domain with .dot suffix
  const withDot = computed(() => {
    if (!domain.value) return "";
    const norm = normalized.value;
    return norm.endsWith(".dot") ? norm : `${norm}.dot`;
  });

  // Domain without .dot suffix
  const withoutDot = computed(() => {
    return normalized.value;
  });

  // Check if domain has .dot suffix
  const hasDotSuffix = computed(() => {
    return domain.value.endsWith(".dot");
  });

  // Truncated domain for display
  const truncated = computed(() => {
    const domainStr = autoAddDot ? withDot.value : domain.value;
    if (!domainStr || domainStr.length <= maxLength) {
      return domainStr;
    }

    // For subdomains, try to intelligently truncate
    const parts = domainStr.split(".");
    if (parts.length < 3) {
      // Simple truncation for non-subdomains
      return `${domainStr.slice(0, maxLength - 3)}...`;
    }

    // For subdomains like "subdomain.parent.dot"
    const subdomainPart = parts[0];
    const parentPart = parts.slice(1).join(".");

    if (subdomainPart && subdomainPart.length > 10) {
      const start = subdomainPart.slice(0, 10);
      const end = subdomainPart.slice(-5);
      return `${start}...${end}.${parentPart}`;
    }

    return domainStr;
  });

  return {
    normalized,
    withDot,
    withoutDot,
    hasDotSuffix,
    truncated,
  };
}

/**
 * Helper function to normalize an array of domain names.
 * Removes .dot suffix from all domains in the array.
 *
 * @param domains - Array of domain strings
 * @returns Array of normalized domain strings
 */
export function normalizeDomains(domains: string[]): string[] {
  return domains.map((d) => utilNormalizeDomain(d));
}

/**
 * Helper function to ensure .dot suffix on an array of domains.
 *
 * @param domains - Array of domain strings
 * @returns Array of domains with .dot suffix
 */
export function ensureDotSuffix(domains: string[]): string[] {
  return domains.map((d) => {
    const normalized = utilNormalizeDomain(d);
    return normalized.endsWith(".dot") ? normalized : `${normalized}.dot`;
  });
}
