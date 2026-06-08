import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import { formatRefundEntryLine } from "../../../src/commands/escrow";

function stripAnsi(input: string): string {
  // forge-lint-equivalent: keep the ANSI assertions readable by stripping colour codes.
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function makeEntry(
  overrides: Partial<{
    entryId: bigint;
    amount: bigint;
    availableAt: bigint;
    tokenId: bigint;
    recipient: Address;
  }> = {},
) {
  return {
    entryId: overrides.entryId ?? 7n,
    recipient: overrides.recipient ?? ("0x1111111111111111111111111111111111111111" as Address),
    amount: overrides.amount ?? 10n * 10n ** 18n,
    availableAt: overrides.availableAt ?? 0n,
    tokenId: overrides.tokenId ?? 12345678901234567890n,
  };
}

describe("formatRefundEntryLine", () => {
  test("marks entries past their cooldown as claimable", () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 60);
    const line = stripAnsi(formatRefundEntryLine(makeEntry({ availableAt: past })));
    expect(line).toContain("#7");
    expect(line).toContain("claimable");
    expect(line).not.toContain("cooldown");
  });

  test("marks entries inside their cooldown window with remaining seconds", () => {
    const future = BigInt(Math.floor(Date.now() / 1000) + 120);
    const line = stripAnsi(formatRefundEntryLine(makeEntry({ availableAt: future })));
    expect(line).toContain("#7");
    expect(line).toMatch(/cooldown \d+s/);
    expect(line).not.toContain("claimable");
  });

  test("renders the amount as a PAS decimal string", () => {
    const entry = makeEntry({ amount: 10n * 10n ** 18n });
    const line = stripAnsi(formatRefundEntryLine(entry));
    // formatWeiAsEther prints 10 ether as "10.000000000000000000".
    expect(line).toContain("10");
    expect(line).toContain("PAS");
  });

  test("truncates large tokenIds for terminal display", () => {
    const entry = makeEntry({ tokenId: 12345678901234567890n });
    const line = stripAnsi(formatRefundEntryLine(entry));
    expect(line).toContain("123456789012");
    expect(line).toContain("...");
    expect(line).not.toContain("12345678901234567890");
  });
});
