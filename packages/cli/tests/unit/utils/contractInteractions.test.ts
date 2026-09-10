import { describe, expect, test } from "bun:test";
import {
  concatHex,
  encodeErrorResult,
  keccak256,
  namehash,
  stringToBytes,
  toBytes,
  type Hex,
} from "viem";
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

function under(parent: Hex, label: string): Hex {
  return keccak256(concatHex([parent, keccak256(toBytes(label))]));
}

describe("deriveDomainNode", () => {
  test("matches namehashUnder(tldNode, labelhash)", () => {
    const expected = keccak256(concatHex([PASEO_NODE, keccak256(toBytes("getsome"))]));
    expect(deriveDomainNode(PASEO_NODE, "getsome")).toBe(expected);
  });

  test("different TLDs yield different nodes for the same label", () => {
    expect(deriveDomainNode(DOT_NODE, "getsome")).not.toBe(deriveDomainNode(PASEO_NODE, "getsome"));
  });

  // paritytech/dotns#291: a dotted name was hashed as one label, so every subname
  // resolved to a node nothing on chain writes to. These vectors are the ones the
  // report quotes for `groomsub.filipgroomcheck` on paseo-v2.
  test("folds a subname per label from the TLD node (EIP-137)", () => {
    const node = deriveDomainNode(PASEO_NODE, "groomsub.filipgroomcheck");
    expect(node).toBe(under(under(PASEO_NODE, "filipgroomcheck"), "groomsub"));
    expect(node).toBe("0xdf79c9e427a3f0e4d6adffd9c0dd9592c04c0b17e6a8ec011971e44406c18139");
    expect(node).not.toBe("0x82779b46f9b403d4ae8cdc3eedd79b01dc576b7a448c41ee1162c20c8c682cf3");
  });

  test("agrees with viem's namehash of the fully qualified name", () => {
    expect(deriveDomainNode(PASEO_NODE, "groomsub.filipgroomcheck")).toBe(
      namehash("groomsub.filipgroomcheck.paseo"),
    );
    expect(deriveDomainNode(DOT_NODE, "a.b.alice")).toBe(namehash("a.b.alice.dot"));
  });

  test("folds arbitrarily deep names in order", () => {
    expect(deriveDomainNode(DOT_NODE, "a.b.alice")).toBe(
      under(under(under(DOT_NODE, "alice"), "b"), "a"),
    );
  });

  test("keeps a lite personhood name as one label", () => {
    // The gateway registers `joseph.42` whole, so its dot is part of the label.
    expect(deriveDomainNode(PASEO_NODE, "joseph.42")).toBe(under(PASEO_NODE, "joseph.42"));
    expect(deriveDomainNode(PASEO_NODE, "joseph.42")).not.toBe(
      under(under(PASEO_NODE, "42"), "joseph"),
    );
  });

  test("splits a dotted name that is not a lite name, even with a numeric leaf", () => {
    // `web3.42` fails the lite stem rule, so it is an ordinary two-level path.
    expect(deriveDomainNode(PASEO_NODE, "web3.42")).toBe(under(under(PASEO_NODE, "42"), "web3"));
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
