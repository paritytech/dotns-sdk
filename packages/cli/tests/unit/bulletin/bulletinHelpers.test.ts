import { describe, expect, test } from "bun:test";
import {
  clampU32,
  isAuthorizationSufficient,
  isTestnetSpecName,
} from "../../../src/commands/bulletin";

const U32_MAX = 0xffff_ffffn;

describe("clampU32", () => {
  test("accepts zero", () => {
    expect(clampU32(0n, "transactions")).toBe(0);
  });

  test("accepts U32_MAX", () => {
    expect(clampU32(U32_MAX, "transactions")).toBe(Number(U32_MAX));
  });

  test("accepts number input", () => {
    expect(clampU32(42, "transactions")).toBe(42);
  });

  test("rejects negative bigint with field name in message", () => {
    expect(() => clampU32(-1n, "transactions")).toThrow(/transactions must be non-negative/);
  });

  test("rejects negative number with field name in message", () => {
    expect(() => clampU32(-5, "bytes")).toThrow(/bytes must be non-negative/);
  });

  test("rejects values above U32_MAX", () => {
    expect(() => clampU32(U32_MAX + 1n, "transactions")).toThrow(/exceeds u32 max/);
  });
});

describe("isAuthorizationSufficient", () => {
  test("returns false when not authorised", () => {
    expect(isAuthorizationSufficient({ authorized: false })).toBe(false);
  });

  test("returns false when authorised but expired", () => {
    expect(isAuthorizationSufficient({ authorized: true, expired: true })).toBe(false);
  });

  test("returns true when authorised and not expired", () => {
    expect(isAuthorizationSufficient({ authorized: true, expired: false })).toBe(true);
  });

  test("returns true when authorised and expired is undefined", () => {
    expect(isAuthorizationSufficient({ authorized: true })).toBe(true);
  });
});

describe("isTestnetSpecName", () => {
  test.each([
    ["paseo", true],
    ["paseo-asset-hub", true],
    ["westend", true],
    ["rococo", true],
    ["foo-testnet", true],
    ["bar-devnet", true],
    ["something-test", true],
    ["something-dev", true],
    ["PASEO", true],
  ])("classifies %s as testnet=%s", (spec, expected) => {
    expect(isTestnetSpecName(spec)).toBe(expected);
  });

  test.each([
    ["polkadot", false],
    ["kusama", false],
    ["asset-hub-polkadot", false],
    ["", false],
  ])("classifies %s as testnet=%s", (spec, expected) => {
    expect(isTestnetSpecName(spec)).toBe(expected);
  });

  test("returns false for null and undefined", () => {
    expect(isTestnetSpecName(null)).toBe(false);
    expect(isTestnetSpecName(undefined)).toBe(false);
  });
});
