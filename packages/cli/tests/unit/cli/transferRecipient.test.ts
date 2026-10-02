import { describe, expect, mock, test } from "bun:test";
import { checksumAddress, concatHex, keccak256, toBytes, zeroAddress, type Hex } from "viem";
import * as realContext from "../../../src/core/context";

// A name recipient resolves through the registry's owner, which answers for a subname
// (a device name included) and for a tokenised name alike.

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const DEVICE_OWNER = "0x00000000000000000000000000000000000000d1";
const LABEL_OWNER = "0x00000000000000000000000000000000000000d2";

function under(parent: Hex, label: string): Hex {
  return keccak256(concatHex([parent, keccak256(toBytes(label))]));
}

const OWNERS: Record<Hex, string> = {
  [under(under(PASEO_NODE, "42"), "joseph")]: DEVICE_OWNER,
  [under(PASEO_NODE, "aliceweb3")]: LABEL_OWNER,
};

const reads: string[] = [];

function fakeRead(
  _ctx: unknown,
  _address: string,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): unknown {
  reads.push(functionName);
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  if (functionName === "tld") return ".paseo";
  if (functionName === "owner") return OWNERS[args[0] as Hex] ?? zeroAddress;
  throw new Error(`unexpected read: ${functionName}`);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: fakeRead }));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { resolveTransferRecipient } = await import("../../../src/cli/transfer");

const ctx = {
  clientWrapper: {},
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
  },
} as unknown as realContext.DotnsContext;

describe("resolveTransferRecipient with a name", () => {
  test("a device name resolves to the registry owner of its folded node", async () => {
    clearTldInfoCache();
    reads.length = 0;
    await expect(resolveTransferRecipient(ctx, "joseph.42")).resolves.toBe(
      checksumAddress(DEVICE_OWNER),
    );
    expect(reads).not.toContain("ownerOf");
  });

  test("an ordinary label resolves through the same registry read", async () => {
    clearTldInfoCache();
    await expect(resolveTransferRecipient(ctx, "aliceweb3.paseo")).resolves.toBe(
      checksumAddress(LABEL_OWNER),
    );
  });

  test("an unregistered name reports it has no owner", async () => {
    clearTldInfoCache();
    await expect(resolveTransferRecipient(ctx, "nobody.99")).rejects.toThrow("has no owner");
  });
});
