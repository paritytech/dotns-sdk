import { describe, expect, test } from "bun:test";
import {
  formatNativeBalance,
  parseNativeBalance,
  withTimeout,
} from "../../../src/utils/formatting";
import { DEFAULT_NATIVE_TOKEN_DECIMALS, EVM_TOKEN_DECIMALS } from "../../../src/utils/constants";

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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

describe("withTimeout cancels and cleans up the losing branch", () => {
  test("resolves with the wrapped value when it settles first", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 50, "fast op");
    expect(result).toBe("ok");
  });

  test("rejects with a descriptive message when the timeout wins", async () => {
    const pending = new Promise<string>(() => {});
    await expect(withTimeout(pending, 10, "stuck op")).rejects.toThrow(
      "stuck op timed out after 10ms",
    );
  });

  test("invokes onTimeout exactly once when the timeout wins", async () => {
    let aborts = 0;
    const pending = new Promise<string>(() => {});

    await expect(
      withTimeout(pending, 10, "stuck op", () => {
        aborts += 1;
      }),
    ).rejects.toThrow();

    expect(aborts).toBe(1);
  });

  test("does not invoke onTimeout when the wrapped promise settles first", async () => {
    let aborts = 0;

    const result = await withTimeout(
      delay(5).then(() => "done"),
      200,
      "fast op",
      () => {
        aborts += 1;
      },
    );

    await delay(250);

    expect(result).toBe("done");
    expect(aborts).toBe(0);
  });
});
