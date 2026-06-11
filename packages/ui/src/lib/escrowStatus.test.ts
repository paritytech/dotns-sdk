import { describe, it, expect } from "bun:test";
import {
  isWithdrawable,
  positionStatusLabel,
  isRefundClaimable,
  totalEscrowAmount,
  cooldownRemainingSeconds,
  formatCooldown,
} from "./escrowStatus";

const NOW = 1_000n;

describe("totalEscrowAmount", () => {
  it("is zero for no positions", () => {
    expect(totalEscrowAmount([])).toBe(0n);
  });

  it("sums position amounts", () => {
    expect(totalEscrowAmount([{ amount: 3n }, { amount: 7n }, { amount: 0n }])).toBe(10n);
  });
});

describe("cooldownRemainingSeconds", () => {
  const base = { amount: 1n, released: true, claimed: false };

  it("returns the seconds left before the cooldown elapses", () => {
    expect(cooldownRemainingSeconds({ ...base, withdrawAvailableAt: NOW + 45n }, NOW)).toBe(45n);
  });

  it("clamps to zero once the cooldown has passed", () => {
    expect(cooldownRemainingSeconds({ ...base, withdrawAvailableAt: NOW - 10n }, NOW)).toBe(0n);
  });
});

describe("formatCooldown", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatCooldown(45n)).toBe("45s");
  });

  it("formats longer durations as minutes and seconds", () => {
    expect(formatCooldown(90n)).toBe("1m 30s");
  });

  it("renders zero for elapsed cooldowns", () => {
    expect(formatCooldown(0n)).toBe("0s");
  });
});

describe("isWithdrawable", () => {
  it("is false while the name is still held", () => {
    expect(
      isWithdrawable({ amount: 5n, withdrawAvailableAt: 0n, released: false, claimed: false }, NOW),
    ).toBe(false);
  });

  it("is false during the cooldown window", () => {
    expect(
      isWithdrawable(
        { amount: 5n, withdrawAvailableAt: NOW + 1n, released: true, claimed: false },
        NOW,
      ),
    ).toBe(false);
  });

  it("is true once released and the cooldown has elapsed", () => {
    expect(
      isWithdrawable({ amount: 5n, withdrawAvailableAt: NOW, released: true, claimed: false }, NOW),
    ).toBe(true);
  });

  it("is false once already claimed", () => {
    expect(
      isWithdrawable(
        { amount: 5n, withdrawAvailableAt: NOW - 1n, released: true, claimed: true },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("positionStatusLabel", () => {
  const base = { amount: 5n, withdrawAvailableAt: NOW, released: false, claimed: false };

  it("labels a held deposit", () => {
    expect(positionStatusLabel(base, NOW)).toBe("Held");
  });

  it("labels a position in cooldown", () => {
    expect(
      positionStatusLabel({ ...base, released: true, withdrawAvailableAt: NOW + 5n }, NOW),
    ).toBe("Cooldown");
  });

  it("labels a withdrawable position", () => {
    expect(positionStatusLabel({ ...base, released: true }, NOW)).toBe("Withdrawable");
  });

  it("labels a claimed position", () => {
    expect(positionStatusLabel({ ...base, released: true, claimed: true }, NOW)).toBe("Claimed");
  });
});

describe("isRefundClaimable", () => {
  it("is false before the cooldown elapses", () => {
    expect(isRefundClaimable({ availableAt: NOW + 1n }, NOW)).toBe(false);
  });

  it("is true at or after the cooldown", () => {
    expect(isRefundClaimable({ availableAt: NOW }, NOW)).toBe(true);
    expect(isRefundClaimable({ availableAt: NOW - 1n }, NOW)).toBe(true);
  });
});
