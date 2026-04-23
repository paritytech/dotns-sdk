import { describe, expect, test } from "bun:test";
import { formatNativeBalance, parseNativeBalance } from "../../../src/utils/formatting";
import { DECIMALS, DECIMALS_DOT } from "../../../src/utils/constants";

describe("native balance formatting uses DOT/PAS 10 decimals", () => {
  test("DECIMALS_DOT is 10 (native DOT/PAS) and DECIMALS is 12 (Revive native)", () => {
    expect(DECIMALS_DOT).toBe(10n);
    expect(DECIMALS).toBe(12n);
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
