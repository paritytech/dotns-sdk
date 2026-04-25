import { describe, expect, test } from "bun:test";
import { encodeErrorResult } from "viem";
import {
  buildRevertError,
  isRevertFlag,
  UNMAPPED_ORIGIN_REVERT_HINT,
} from "../../../src/utils/contractInteractions";
import { POP_RULES_ABI } from "../../../src/utils/constants";

describe("isRevertFlag matches the EVM revert bit", () => {
  test.each([
    [0n, false],
    [1n, true],
    [2n, false],
    [3n, true],
  ])("flags=%p → %p", (flags, expected) => {
    expect(isRevertFlag(flags)).toBe(expected);
  });
});

describe("buildRevertError", () => {
  test("empty data returns the unmapped-origin hint", () => {
    expect(buildRevertError("0x", POP_RULES_ABI).message).toBe(UNMAPPED_ORIGIN_REVERT_HINT);
  });

  test("known ABI selector decodes to the named error", () => {
    const data = encodeErrorResult({
      abi: POP_RULES_ABI,
      errorName: "OwnableUnauthorizedAccount",
      args: ["0x000000000000000000000000000000000000dead"],
    });

    expect(buildRevertError(data, POP_RULES_ABI).message).toContain("OwnableUnauthorizedAccount");
  });

  test("unknown selector falls back to raw hex", () => {
    const unknownData = "0xdeadbeef";
    expect(buildRevertError(unknownData, POP_RULES_ABI).message).toBe(
      `Contract reverted: ${unknownData}`,
    );
  });
});
