import { getAddress } from "viem";

// Compares two EVM addresses by their checksummed form so case differences never
// register as different accounts. Missing or invalid input compares as not equal.
export function isSameEvmAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}
