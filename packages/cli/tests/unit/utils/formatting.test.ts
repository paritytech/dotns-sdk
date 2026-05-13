import { describe, expect, test } from "bun:test";
import { formatNativeBalance, parseNativeBalance } from "../../../src/utils/formatting";
import { DEFAULT_NATIVE_TOKEN_DECIMALS, EVM_TOKEN_DECIMALS } from "../../../src/utils/constants";

describe("native balance formatting uses DOT/PAS 10 decimals", () => {
  test("defaults to 10 native decimals and 18 EVM decimals", () => {
    expect(DEFAULT_NATIVE_TOKEN_DECIMALS).toBe(10);
    expect(EVM_TOKEN_DECIMALS).toBe(18);
  });

  test("formatNativeBalance renders 5000 PAS from 5000 * 10^10 units", () => {
    const fiveThousandPasInSmallestUnits = 5000n * 10n ** 10n;
    expect(formatNativeBalance(fiveThousandPasInSmallestUnits)).toBe("5000.0000000000");
  });

  test("formatNativeBalance renders fractional 0.1 PAS as 10^9 units", () => {
    expect(formatNativeBalance(10n ** 9n)).toBe("0.1000000000");
  });

  test("formatNativeBalance renders zero balance", () => {
    expect(formatNativeBalance(0n)).toBe("0.0000000000");
  });

  test("parseNativeBalance inverts formatNativeBalance", () => {
    const original = 5000n * 10n ** 10n + 1234567890n;
    expect(parseNativeBalance(formatNativeBalance(original))).toBe(original);
  });

  test("parseNativeBalance('0.1') is 10^9", () => {
    expect(parseNativeBalance("0.1")).toBe(10n ** 9n);
  });
});
