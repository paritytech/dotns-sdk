import { describe, it, expect } from "bun:test";
import { isWithdrawable, positionStatusLabel, isRefundClaimable } from "./escrowStatus";

const NOW = 1_000n;

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
