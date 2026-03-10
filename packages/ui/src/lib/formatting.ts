import { formatUnits } from "viem";
import type { Unit } from "@/type";

const PAS_DECIMALS = 10;

/**
 * Formatting Utilities
 *
 * Functions for displaying values in human-readable formats
 */

/**
 * Format a value to a fixed number of decimal places
 *
 * @param value - String representation of a number
 * @param decimals - Number of decimal places (default: 8)
 * @returns Formatted string
 */
export function toFixed(value: string, decimals = 8): string {
  const num = parseFloat(value);
  return num.toFixed(decimals);
}

/**
 * Format PAS token amount for display
 *
 * @param raw - Raw bigint value
 * @returns Formatted string with PAS decimals
 */
export function formatPas(raw: bigint): string {
  return formatUnits(raw, PAS_DECIMALS);
}

/**
 * Format a timestamp for display
 *
 * @param ts - Timestamp as bigint, string, or null
 * @returns Formatted date string or "—" if invalid
 */
export function formatTimestamp(ts: bigint | string | null): string {
  if (!ts) return "—";
  try {
    const num = typeof ts === "bigint" ? Number(ts) : parseInt(ts);
    const date = new Date(num * 1000);
    return date.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Add a percentage to a bigint value
 *
 * @param value - Base value
 * @param percent - Percentage to add
 * @returns New value with percentage added
 *
 * @example
 * addPercentage(100n, 20) // Returns 120n
 */
export function addPercentage(value: bigint, percent: number): bigint {
  return (value * BigInt(100 + percent)) / 100n;
}

/**
 * Get seconds for a given time unit
 *
 * @param unit - Time unit (minutes, days, months, years)
 * @returns Number of seconds as bigint
 */
export function getSecondsForUnit(unit: Unit): bigint {
  switch (unit) {
    case "minutes":
      return 60n;
    case "days":
      return 60n * 60n * 24n;
    case "months":
      return 60n * 60n * 24n * 30n;
    case "years":
      return 60n * 60n * 24n * 365n;
    default:
      return 60n;
  }
}

/**
 * Generate dummy domain names for testing/demo purposes
 *
 * @param count - Number of domains to generate (default: 20)
 * @returns Array of unique domain names
 */
export function generateDummyDomains(count = 20): string[] {
  const tlds = ["dot", "eth", "xyz", "dao"];
  const secondLevel = ["alpha", "beta", "gamma", "delta", "omega", "kappa"];
  const prefixes = ["user", "dev", "team", "node", "player", "agent"];

  const domains: string[] = [];

  for (let i = 0; i < count; i++) {
    const level = Math.floor(Math.random() * 3) + 1;
    const tld = tlds[Math.floor(Math.random() * tlds.length)];
    const name = secondLevel[Math.floor(Math.random() * secondLevel.length)];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    if (level === 1) {
      domains.push(`${tld}`);
    } else if (level === 2) {
      domains.push(`${name}.${tld}`);
    } else {
      domains.push(`${prefix}.${name}.${tld}`);
    }
  }

  return [...new Set(domains)];
}
