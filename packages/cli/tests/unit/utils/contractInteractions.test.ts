import { describe, expect, test } from "bun:test";
import { concatHex, encodeErrorResult, keccak256, stringToBytes, toBytes, type Hex } from "viem";
import {
  buildRevertError,
  decodeContractRevertError,
  deriveDomainNode,
  deriveDomainTokenId,
  isRevertFlag,
  EMPTY_DATA_REVERT_HINT,
} from "../../../src/utils/contractInteractions";
import { POP_RULES_ABI } from "../../../src/utils/constants";

function tldNodeOf(tldLabel: string): Hex {
  const root = ("0x" + "00".repeat(32)) as Hex;
  return keccak256(concatHex([root, keccak256(stringToBytes(tldLabel))]));
}

const DOT_NODE = tldNodeOf("dot");
const PASEO_NODE = tldNodeOf("paseo");

describe("deriveDomainNode", () => {
  test("matches namehashUnder(tldNode, labelhash)", () => {
    const expected = keccak256(concatHex([PASEO_NODE, keccak256(toBytes("getsome"))]));
    expect(deriveDomainNode(PASEO_NODE, "getsome")).toBe(expected);
  });

  test("different TLDs yield different nodes for the same label", () => {
    expect(deriveDomainNode(DOT_NODE, "getsome")).not.toBe(deriveDomainNode(PASEO_NODE, "getsome"));
  });
});

describe("deriveDomainTokenId", () => {
  test("is uint256(node)", () => {
    expect(deriveDomainTokenId(PASEO_NODE, "getsome")).toBe(
      BigInt(deriveDomainNode(PASEO_NODE, "getsome")),
    );
  });

  test("known vector: getsome under .dot", () => {
    expect(deriveDomainTokenId(DOT_NODE, "getsome")).toBe(
      BigInt("0x775ecb7b608e730a716b1723d9bbbe1dd8557b96bd145e2bc3adda0e5e629f97"),
    );
  });
});

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
  test("empty data names both the unmapped-origin and stale-ABI causes", () => {
    const message = buildRevertError("0x", POP_RULES_ABI).message;
    expect(message).toContain("Contract reverted with empty data");
    expect(message).toContain(EMPTY_DATA_REVERT_HINT);
    expect(message).toContain("not mapped");
    expect(message).toContain("out of date");
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

describe("decodeContractRevertError", () => {
  test("empty data includes operation context", () => {
    const error = decodeContractRevertError("0x", POP_RULES_ABI, "Registration");
    expect(error.message).toContain("Registration reverted with empty data");
    expect(error.message).toContain(EMPTY_DATA_REVERT_HINT);
  });

  test("non-empty data decodes against the ABI", () => {
    const data = encodeErrorResult({
      abi: POP_RULES_ABI,
      errorName: "OwnableUnauthorizedAccount",
      args: ["0x000000000000000000000000000000000000dead"],
    });

    expect(decodeContractRevertError(data, POP_RULES_ABI, "Registration").message).toContain(
      "OwnableUnauthorizedAccount",
    );
  });
});
