import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realContext from "../../../src/core/context";

// The registry's SubnodeRecord carries a `persist` flag. These tests pin the
// record the write actually receives, so ABI drift of this shape fails here.

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";

const writes: { functionName: string; args: unknown[] }[] = [];

function fakeRead(_ctx: unknown, _address: string, _abi: unknown, functionName: string): unknown {
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  if (functionName === "tld") return ".paseo";
  throw new Error(`unexpected read: ${functionName}`);
}

async function fakeWrite(
  _ctx: unknown,
  _address: string,
  _value: bigint,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): Promise<string> {
  writes.push({ functionName, args });
  return "0xf00d";
}

mock.module("../../../src/core/context", () => ({
  ...realContext,
  read: fakeRead,
  write: fakeWrite,
}));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { registerSubnode } = await import("../../../src/commands/register");

const ctx = {
  clientWrapper: {},
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
  },
} as unknown as realContext.DotnsContext;

const OWNER = "0x00000000000000000000000000000000000000ee" as `0x${string}`;

type EncodedSubnodeRecord = { persist: boolean; subLabel: string };

beforeEach(() => {
  writes.length = 0;
  clearTldInfoCache();
});

describe("registerSubnode encodes the persist flag", () => {
  test("persists into the owner's store by default", async () => {
    await registerSubnode(ctx, "blog", "alice", OWNER);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.functionName).toBe("setSubnodeOwner");
    const record = writes[0]!.args[0] as EncodedSubnodeRecord;
    expect(record.persist).toBe(true);
    expect(record.subLabel).toBe("blog");
  });

  test("skips store indexing when persist is disabled", async () => {
    await registerSubnode(ctx, "blog", "alice", OWNER, { persist: false });

    const record = writes[0]!.args[0] as EncodedSubnodeRecord;
    expect(record.persist).toBe(false);
  });
});

describe("registerSubnode bounds the parent path", () => {
  test("rejects a parent path over the bound, before writing", async () => {
    const parent = Array.from({ length: 5 }, () => "a".repeat(63)).join(".");
    await expect(registerSubnode(ctx, "blog", parent, OWNER)).rejects.toThrow(/bytes long/);
    expect(writes).toHaveLength(0);
  });
});
