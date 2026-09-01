import { beforeEach, describe, expect, mock, test } from "bun:test";
import { zeroAddress } from "viem";
import * as realContext from "../../../src/core/context";

// paritytech/dotns#257: lookup hashed user input as-is, so a fully-qualified
// name (`alice.paseo`) derived the wrong node and read as "not registered",
// while register normalised the same input. These tests pin the fix: both
// lookup entry points must resolve `alice` and `alice.<tld>` identically.

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";

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
  if (functionName === "recordExists") return false;
  if (functionName === "owner") return zeroAddress;
  if (functionName === "resolver") return zeroAddress;
  if (functionName === "ownerOf") throw new Error("Contract reverted: ERC721NonexistentToken");
  throw new Error(`unexpected read: ${functionName}`);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: fakeRead }));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { performDomainLookup, performOwnerOfLookup } = await import("../../../src/commands/lookup");

const namingCtx = {
  // Any object works as the WeakMap cache key that scopes the TLD to this client.
  clientWrapper: {},
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRAR: "0x00000000000000000000000000000000000000bb",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
    DOTNS_RESOLVER: "0x00000000000000000000000000000000000000dd",
  },
} as unknown as realContext.DotnsContext;

beforeEach(() => {
  for (const key of Object.keys(seenArgs)) delete seenArgs[key];
  clearTldInfoCache();
});

describe("lookup normalises fully-qualified names (dotns#257)", () => {
  test("performDomainLookup derives the same node for `alice` and `alice.paseo`", async () => {
    const bare = await performDomainLookup(namingCtx, "alice");
    const qualified = await performDomainLookup(namingCtx, "alice.paseo");

    expect(qualified.node).toBe(bare.node);
    expect(bare.domain).toBe("alice.paseo");
    // Previously rendered `alice.paseo.paseo`.
    expect(qualified.domain).toBe("alice.paseo");
  });

  test("performOwnerOfLookup derives the same tokenId for `alice` and `alice.paseo`", async () => {
    const bare = await performOwnerOfLookup(namingCtx, "alice");
    const qualified = await performOwnerOfLookup(namingCtx, "ALICE.paseo ");

    const ownerOfArgs = seenArgs["ownerOf"] ?? [];
    expect(ownerOfArgs).toHaveLength(2);
    expect(ownerOfArgs[1]).toEqual(ownerOfArgs[0]);
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
