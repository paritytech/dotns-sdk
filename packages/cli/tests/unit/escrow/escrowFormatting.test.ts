import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import {
  formatRefundEntryLine,
  totalEscrowAmount,
  cooldownRemainingSeconds,
  formatCooldown,
  formatPositionStatus,
  formatPositionsTable,
} from "../../../src/commands/escrow";

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

function makePosition(
  overrides: Partial<{
    amount: bigint;
    released: boolean;
    claimed: boolean;
    withdrawAvailableAt: bigint;
    domain: string;
  }> = {},
) {
  return {
    domain: overrides.domain ?? "alice",
    tokenId: 1n,
    recipient: "0x1111111111111111111111111111111111111111" as Address,
    asset: "0x0000000000000000000000000000000000000000" as Address,
    amount: overrides.amount ?? 1n,
    withdrawAvailableAt: overrides.withdrawAvailableAt ?? 0n,
    released: overrides.released ?? false,
    claimed: overrides.claimed ?? false,
  };
}

const NOW = 1_000n;

describe("totalEscrowAmount", () => {
  test("is zero for no positions", () => {
    expect(totalEscrowAmount([])).toBe(0n);
  });

  test("sums position amounts", () => {
    expect(
      totalEscrowAmount([
        makePosition({ amount: 3n }),
        makePosition({ amount: 7n }),
        makePosition({ amount: 0n }),
      ]),
    ).toBe(10n);
  });
});

describe("cooldownRemainingSeconds", () => {
  test("returns the seconds left, clamped to zero once elapsed", () => {
    expect(cooldownRemainingSeconds({ withdrawAvailableAt: NOW + 45n }, NOW)).toBe(45n);
    expect(cooldownRemainingSeconds({ withdrawAvailableAt: NOW - 5n }, NOW)).toBe(0n);
  });
});

describe("formatCooldown", () => {
  test("formats seconds and minutes", () => {
    expect(formatCooldown(45n)).toBe("45s");
    expect(formatCooldown(90n)).toBe("1m 30s");
    expect(formatCooldown(0n)).toBe("0s");
  });
});

describe("formatPositionStatus", () => {
  test("held when not released", () => {
    expect(formatPositionStatus(makePosition(), NOW)).toBe("held");
  });

  test("embeds the cooldown countdown while released and waiting", () => {
    expect(
      formatPositionStatus(makePosition({ released: true, withdrawAvailableAt: NOW + 30n }), NOW),
    ).toBe("cooldown 30s");
  });

  test("claimable once the cooldown elapses", () => {
    expect(
      formatPositionStatus(makePosition({ released: true, withdrawAvailableAt: NOW - 1n }), NOW),
    ).toBe("claimable");
  });

  test("claimed after withdrawal", () => {
    expect(formatPositionStatus(makePosition({ released: true, claimed: true }), NOW)).toBe(
      "claimed",
    );
  });
});

describe("formatPositionsTable", () => {
  test("returns no lines for an empty set", () => {
    expect(formatPositionsTable([], NOW)).toEqual([]);
  });

  test("renders a header plus one aligned row per position with the cooldown", () => {
    const lines = formatPositionsTable(
      [makePosition({ released: true, withdrawAvailableAt: NOW + 60n, domain: "alice" })],
      NOW,
    ).map(stripAnsi);
    expect(lines[0]).toContain("NAME");
    expect(lines[0]).toContain("DEPOSIT");
    expect(lines[0]).toContain("STATUS");
    expect(lines[1]).toContain("alice.dot");
    expect(lines[1]).toContain("cooldown 1m 0s");
  });
});
