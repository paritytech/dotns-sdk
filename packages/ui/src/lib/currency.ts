/**
 * Currency Conversion Utilities
 *
 * Decimal Constants for PAS Token and EVM Compatibility
 *
 * @remarks
 * Paseo Asset Hub Next uses a 10-decimal native token that is converted
 * to 18-decimal wei for EVM compatibility via the Revive pallet. (Matches
 * the CLI's DEFAULT_NATIVE_TOKEN_DECIMALS=10 / EVM_TOKEN_DECIMALS=18.)
 *
 * - Native substrate units: 10 decimals (PAS token)
 * - EVM wei units: 18 decimals (contract space)
 * - Conversion ratio: 1 native unit = 100,000,000 wei (10^8 = 10^(18-10))
 *
 * **CRITICAL**: Contract read operations return wei values.
 * Transaction submissions require native units.
 */

export const DECIMALS = 10n;
export const NATIVE_TO_ETH_RATIO = 100_000_000n;

/**
 * Converts EVM wei units to native substrate units. Use this when passing a value
 * read from a contract call (wei) into a transaction submission (native units).
 *
 * @param weiValue - Value in EVM wei units (18 decimals)
 * @returns Value in native substrate units (10 decimals)
 */
export function convertWeiToNative(weiValue: bigint): bigint {
  return weiValue / NATIVE_TO_ETH_RATIO;
}

/**
 * Converts EVM wei to native units, rounding up. Use when the native value must
 * fully cover a wei-denominated required fee: flooring a fee that is not a whole
 * number of native units underpays and reverts on-chain.
 *
 * @param weiValue - Value in EVM wei units (18 decimals)
 * @returns Smallest native unit value whose wei equivalent is at least weiValue
 */
export function convertWeiToNativeCeil(weiValue: bigint): bigint {
  return (weiValue + NATIVE_TO_ETH_RATIO - 1n) / NATIVE_TO_ETH_RATIO;
}

/**
 * Converts native substrate units to EVM wei units.
 *
 * @param nativeValue - Value in native substrate units (10 decimals)
 * @returns Value in EVM wei units (18 decimals)
 */
export function convertNativeToWei(nativeValue: bigint): bigint {
  return nativeValue * NATIVE_TO_ETH_RATIO;
}

/**
 * Formats a native substrate balance for display.
 *
 * @param valueInNativeUnits - Balance in native substrate units (10 decimals)
 * @returns Formatted string with full decimal expansion
 */
export function formatNativeBalance(valueInNativeUnits: bigint): string {
  const divisor = 10n ** DECIMALS;
  const wholePart = valueInNativeUnits / divisor;
  const fractionalPart = valueInNativeUnits % divisor;

  let fractionalString = fractionalPart.toString();
  const missingZeroCount = DECIMALS - BigInt(fractionalString.length);
  if (missingZeroCount > 0n) {
    fractionalString = "0".repeat(Number(missingZeroCount)) + fractionalString;
  }

  return `${wholePart}.${fractionalString}`;
}

/**
 * Formats a wei value for display using ether units.
 *
 * @param weiValue - Value in wei (18 decimals)
 * @returns Human-readable string in ether units
 */
export function formatWeiAsEther(weiValue: bigint): string {
  const divisor = 10n ** 18n;
  const wholePart = weiValue / divisor;
  const fractionalPart = weiValue % divisor;

  let fractionalString = fractionalPart.toString().padStart(18, "0");
  fractionalString = fractionalString.replace(/0+$/, "");

  if (fractionalString === "") return wholePart.toString();
  return `${wholePart}.${fractionalString}`;
}
