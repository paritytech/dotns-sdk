import { beforeEach, describe, expect, mock, test } from "bun:test";
import { zeroAddress, type Address } from "viem";
import * as realContext from "../../../src/core/context";
import type { ReleasePosition } from "../../../src/commands/inspectName";
import { nowSeconds } from "../../../src/utils/formatting";

// Each refusal is a preflight assert reading the fact the escrow's own `require` checks, so no
// write is submitted for a redeem the chain would reject.

const TLD_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const HOLDER = "0x1111111111111111111111111111111111111111" as Address;
const STRANGER = "0x2222222222222222222222222222222222222222" as Address;
const ESCROW = "0x00000000000000000000000000000000000000ee" as Address;

let position: ReleasePosition;
const writes: { functionName: string; args: unknown[] }[] = [];

function fakeRead(_ctx: unknown, _address: string, _abi: unknown, functionName: string): unknown {
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return TLD_NODE;
  if (functionName === "tld") return ".paseo";
  if (functionName === "recordExists") return true;
  if (functionName === "exists") return true;
  if (functionName === "ownerOf") return ESCROW;
  if (functionName === "isSoulbound") return false;
  if (functionName === "getReleasePosition") return position;
  throw new Error(`unexpected read: ${functionName}`);
}

function fakeWrite(
  _ctx: unknown,
  _address: string,
  _value: bigint,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): string {
  writes.push({ functionName, args });
  return `0xtx-${functionName}`;
}

mock.module("../../../src/core/context", () => ({
  ...realContext,
  read: fakeRead,
  write: fakeWrite,
}));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { redeemName } = await import("../../../src/commands/escrow");

const ctx = {
  clientWrapper: { resolveOwnEvmAddress: async () => HOLDER },
  origin: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRAR: "0x00000000000000000000000000000000000000bb",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
    DOTNS_NAME_ESCROW: ESCROW,
  },
} as unknown as realContext.DotnsContext;

function releasedPosition(overrides: Partial<ReleasePosition> = {}): ReleasePosition {
  return {
    recipient: HOLDER,
    asset: zeroAddress,
    amount: 5n,
    withdrawAvailableAt: 0n,
    redeemableUntil: nowSeconds() + 3_600n,
    released: true,
    claimed: false,
    ...overrides,
  };
}

beforeEach(() => {
  position = releasedPosition();
  writes.length = 0;
  clearTldInfoCache();
});

describe("redeemName refuses before the write", () => {
  test("a name that was never released", async () => {
    position = releasedPosition({ released: false });
    await expect(redeemName(ctx, "alice")).rejects.toThrow("is not released");
    expect(writes).toEqual([]);
  });

  test("a caller who is not the previous holder", async () => {
    position = releasedPosition({ recipient: STRANGER });
    await expect(redeemName(ctx, "alice")).rejects.toThrow(`only the previous holder ${STRANGER}`);
    expect(writes).toEqual([]);
  });

  test("a closed redeem window, saying when it closed", async () => {
    position = releasedPosition({ redeemableUntil: 1_200n });
    await expect(redeemName(ctx, "alice")).rejects.toThrow(
      "closed at 1970-01-01T00:20:00.000Z; the name is now reclaimable by anyone",
    );
    expect(writes).toEqual([]);
  });

  test("a deposit already withdrawn inside the window", async () => {
    position = releasedPosition({ claimed: true });
    await expect(redeemName(ctx, "alice")).rejects.toThrow("already withdrawn");
    expect(writes).toEqual([]);
  });

  test("otherwise submits redeem for the token", async () => {
    const result = await redeemName(ctx, "alice");
    expect(result.domain).toBe("alice.paseo");
    expect(writes).toEqual([{ functionName: "redeem", args: [result.tokenId] }]);
  });
});
