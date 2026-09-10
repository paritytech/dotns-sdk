import { beforeEach, describe, expect, mock, test } from "bun:test";
import { concatHex, keccak256, toBytes, zeroAddress, type Hex } from "viem";
import * as realContext from "../../../src/core/context";

// paritytech/dotns#257: lookup hashed user input as-is, so a fully-qualified
// name (`alice.paseo`) derived the wrong node and read as "not registered",
// while register normalised the same input. These tests pin the fix: both
// lookup entry points must resolve `alice` and `alice.<tld>` identically.
//
// paritytech/dotns#291: after stripping the TLD, a dotted name was hashed as one
// label instead of folding per label, so every subname read as unregistered. The
// subname tests below pin the EIP-137 fold and the registry-backed owner read.

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";

const SUBNAME_OWNER = "0x00000000000000000000000000000000000000ee";

function under(parent: Hex, label: string): Hex {
  return keccak256(concatHex([parent, keccak256(toBytes(label))]));
}

const ALICE_NODE = under(PASEO_NODE, "alice");
const BLOG_ALICE_NODE = under(ALICE_NODE, "blog");

// Node/tokenId arguments seen by the registry and registrar, keyed by function.
const seenArgs: Record<string, unknown[][]> = {};

function fakeRead(
  _ctx: unknown,
  _address: string,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): unknown {
  (seenArgs[functionName] ??= []).push(args);
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  // The registry returns the suffix with its leading dot; resolveTldInfo strips it.
  if (functionName === "tld") return ".paseo";
  // Only the subname `blog.alice` exists in this fake chain.
  const node = args[0];
  const isSubname = node === BLOG_ALICE_NODE;
  if (functionName === "recordExists") return isSubname;
  if (functionName === "owner") return isSubname ? SUBNAME_OWNER : zeroAddress;
  if (functionName === "resolver") return zeroAddress;
  if (functionName === "getLabelStore") return zeroAddress;
  if (functionName === "chatKey") return "0x";
  if (functionName === "ownerOf") throw new Error("Contract reverted: ERC721NonexistentToken");
  throw new Error(`unexpected read: ${functionName}`);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: fakeRead }));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { performDomainLookup, performOwnerOfLookup } = await import("../../../src/commands/lookup");

const namingCtx = {
  // Any object works as the WeakMap cache key that scopes the TLD to this client.
  clientWrapper: {
    getSubstrateAddress: async (evm: string) => `substrate:${evm}`,
    client: { query: { System: { Account: { getValue: async () => ({ data: { free: 0n } }) } } } },
  },
  nativeTokenDecimals: 10,
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRAR: "0x00000000000000000000000000000000000000bb",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
    DOTNS_RESOLVER: "0x00000000000000000000000000000000000000dd",
    STORE_FACTORY: "0x00000000000000000000000000000000000000a1",
    DOTNS_POP_RESOLVER: "0x00000000000000000000000000000000000000a2",
  },
} as unknown as realContext.DotnsContext;

beforeEach(() => {
  for (const key of Object.keys(seenArgs)) delete seenArgs[key];
  clearTldInfoCache();
});

describe("lookup normalises fully-qualified names", () => {
  test("performDomainLookup derives the same node for `alice` and `alice.paseo`", async () => {
    const bare = await performDomainLookup(namingCtx, "alice");
    const qualified = await performDomainLookup(namingCtx, "alice.paseo");

    expect(qualified.node).toBe(bare.node);
    expect(bare.domain).toBe("alice.paseo");
    // Previously rendered `alice.paseo.paseo`.
    expect(qualified.domain).toBe("alice.paseo");
  });

  test("performOwnerOfLookup derives the same node for `alice` and `alice.paseo`", async () => {
    const bare = await performOwnerOfLookup(namingCtx, "alice");
    const qualified = await performOwnerOfLookup(namingCtx, "ALICE.paseo ");

    const ownerArgs = seenArgs["owner"] ?? [];
    expect(ownerArgs).toHaveLength(2);
    expect(ownerArgs[1]).toEqual(ownerArgs[0]);
    expect(bare.label).toBe("alice");
    expect(qualified.label).toBe("alice");
    expect(qualified.domain).toBe("alice.paseo");
  });

  test("a name under a different suffix is not stripped", async () => {
    const foreign = await performDomainLookup(namingCtx, "alice.dot");
    const bare = await performDomainLookup(namingCtx, "alice");

    expect(foreign.node).not.toBe(bare.node);
    expect(foreign.domain).toBe("alice.dot.paseo");
  });
});

describe("lookup folds subnames per label", () => {
  test("performDomainLookup queries the EIP-137 node of `blog.alice`", async () => {
    const result = await performDomainLookup(namingCtx, "blog.alice");

    expect(result.node).toBe(BLOG_ALICE_NODE);
    expect(result.node).not.toBe(under(PASEO_NODE, "blog.alice"));
    expect(result.domain).toBe("blog.alice.paseo");
    expect(result.exists).toBe(true);
    expect(result.owner.toLowerCase()).toBe(SUBNAME_OWNER);
  });

  test("`blog.alice` and `blog.alice.paseo` resolve to the same node", async () => {
    const bare = await performDomainLookup(namingCtx, "blog.alice");
    const qualified = await performDomainLookup(namingCtx, "blog.alice.paseo");

    expect(qualified.node).toBe(bare.node);
    expect(qualified.domain).toBe("blog.alice.paseo");
  });

  test("performOwnerOfLookup reads the registry owner, so a subname reports its holder", async () => {
    const result = await performOwnerOfLookup(namingCtx, "blog.alice");

    // A subname is not an ERC721 token, so the registrar can never answer for it.
    expect(seenArgs["ownerOf"]).toBeUndefined();
    expect(seenArgs["owner"]?.[0]).toEqual([BLOG_ALICE_NODE]);
    expect(result.registered).toBe(true);
    expect(result.ownerEvm.toLowerCase()).toBe(SUBNAME_OWNER);
    expect(result.domain).toBe("blog.alice.paseo");
  });

  test("performOwnerOfLookup reports an unregistered name as such", async () => {
    const result = await performOwnerOfLookup(namingCtx, "nobody");

    expect(result.registered).toBe(false);
    expect(result.ownerEvm).toBe(zeroAddress);
    expect(result.ownerSubstrate).toBe("(none)");
  });
});
