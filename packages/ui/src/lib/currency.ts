/**
 * Currency Conversion Utilities
 *
 * Decimal Constants for PAS Token and EVM Compatibility
 *
 * @remarks
 * The Paseo Asset Hub uses a 12-decimal native token that is converted
 * to 18-decimal wei for EVM compatibility via the Revive pallet.
 *
 * - Native substrate units: 12 decimals (PAS token)
 * - EVM wei units: 18 decimals (contract space)
 * - Conversion ratio: 1 native unit = 1,000,000 wei (10^6)
 *
 * **CRITICAL**: Contract read operations return wei values.
 * Transaction submissions require native units.
 */

export const DECIMALS = 12n;
export const NATIVE_TO_ETH_RATIO = 1_000_000n;

/**
 * Converts EVM wei units to native substrate units.
 *
 * @param weiValue - Value in EVM wei units (18 decimals)
 * @returns Value in native substrate units (12 decimals)
 *
 * @remarks
 * **CRITICAL**: Use this when taking values from contract calls (which return wei)
 * and passing them to transaction submissions (which expect native units).
 *
 * @example
 * ```typescript
 * const priceWei = await price(label); // Returns wei from contract
 * const priceNative = convertWeiToNative(priceWei); // Convert for transaction
 * await registerDomain(registration, priceNative);
 * ```
 */
export function convertWeiToNative(weiValue: bigint): bigint {
  return weiValue / NATIVE_TO_ETH_RATIO;
}

/**
 * Converts native substrate units to EVM wei units.
 *
 * @param nativeValue - Value in native substrate units (12 decimals)
 * @returns Value in EVM wei units (18 decimals)
 *
 * @example
 * ```typescript
 * const nativeAmount = 1_000_000_000_000n; // 1.0 PAS
 * const weiAmount = convertNativeToWei(nativeAmount); // 1.0 in wei
 * ```
 */
export function convertNativeToWei(nativeValue: bigint): bigint {
  return nativeValue * NATIVE_TO_ETH_RATIO;
}

/**
 * Formats a native substrate balance for display.
 *
 * @param valueInNativeUnits - Balance in native substrate units (12 decimals)
 * @returns Formatted string with full decimal expansion
 *
 * @example
 * ```typescript
 * formatNativeBalance(1_000_000_000_000n); // "1.000000000000"
 * formatNativeBalance(8_000_000_000n);     // "0.008000000000"
 * ```
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
 *
 * @example
 * ```typescript
 * formatWeiAsEther(8_000_000_000_000_000n); // "0.008"
 * ```
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
