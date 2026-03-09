import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTHORIZATION_BYTES,
  DEFAULT_AUTHORIZATION_TRANSACTIONS,
} from "../../../src/utils/constants";

function isAuthorizationSufficient(
  existingTransactions: number,
  existingBytes: bigint,
  requestedTransactions: number = DEFAULT_AUTHORIZATION_TRANSACTIONS,
  requestedBytes: bigint = DEFAULT_AUTHORIZATION_BYTES,
): boolean {
  return existingTransactions >= requestedTransactions && existingBytes >= requestedBytes;
}

describe("bulletin authorization defaults", () => {
  test("DEFAULT_AUTHORIZATION_BYTES is 500 MB", () => {
    expect(DEFAULT_AUTHORIZATION_BYTES).toBe(BigInt(524288000));
  });

  test("DEFAULT_AUTHORIZATION_BYTES is less than 1 GB", () => {
    const oneGigabyte = BigInt(1024 * 1024 * 1024);
    expect(DEFAULT_AUTHORIZATION_BYTES < oneGigabyte).toBe(true);
  });

  test("DEFAULT_AUTHORIZATION_TRANSACTIONS is 1,000,000", () => {
    expect(DEFAULT_AUTHORIZATION_TRANSACTIONS).toBe(1_000_000);
  });
});

describe("authorization sufficiency check", () => {
  test("Paseo account with 196 GB passes sufficiency check against 500 MB default", () => {
    const paseoExistingBytes = BigInt(196) * BigInt(1024 * 1024 * 1024);
    const paseoExistingTransactions = 1_000_000;

    expect(isAuthorizationSufficient(paseoExistingTransactions, paseoExistingBytes)).toBe(true);
  });

  test("Paseo account would have FAILED with old 1 TB default", () => {
    const oldDefaultBytes = BigInt(1099511627776);
    const paseoExistingBytes = BigInt(196) * BigInt(1024 * 1024 * 1024);

    expect(paseoExistingBytes < oldDefaultBytes).toBe(true);
    expect(
      isAuthorizationSufficient(
        1_000_000,
        paseoExistingBytes,
        DEFAULT_AUTHORIZATION_TRANSACTIONS,
        oldDefaultBytes,
      ),
    ).toBe(false);
  });

  test("exact match passes sufficiency check", () => {
    expect(
      isAuthorizationSufficient(DEFAULT_AUTHORIZATION_TRANSACTIONS, DEFAULT_AUTHORIZATION_BYTES),
    ).toBe(true);
  });

  test("higher values pass sufficiency check", () => {
    expect(
      isAuthorizationSufficient(
        DEFAULT_AUTHORIZATION_TRANSACTIONS * 2,
        DEFAULT_AUTHORIZATION_BYTES * 2n,
      ),
    ).toBe(true);
  });

  test("zero authorization fails sufficiency check", () => {
    expect(isAuthorizationSufficient(0, 0n)).toBe(false);
  });

  test("sufficient transactions but insufficient bytes fails", () => {
    expect(
      isAuthorizationSufficient(
        DEFAULT_AUTHORIZATION_TRANSACTIONS,
        DEFAULT_AUTHORIZATION_BYTES - 1n,
      ),
    ).toBe(false);
  });

  test("sufficient bytes but insufficient transactions fails", () => {
    expect(
      isAuthorizationSufficient(
        DEFAULT_AUTHORIZATION_TRANSACTIONS - 1,
        DEFAULT_AUTHORIZATION_BYTES,
      ),
    ).toBe(false);
  });
});
