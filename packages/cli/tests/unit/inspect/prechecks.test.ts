import { beforeEach, describe, expect, mock, test } from "bun:test";
import { zeroAddress, type Address } from "viem";
import * as realContext from "../../../src/core/context";

// paritytech/dotns#252: release, transfer and register were offered on names the contracts
// would reject, and the user found out from a decoded revert after signing (release even left
// an approval behind). These tests pin the pre-checks: every refusal is inspectName reading the
// same fact the contract's own `require` checks, before any write is submitted.

const TLD_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const HOLDER = "0x1111111111111111111111111111111111111111" as Address;
const STRANGER = "0x2222222222222222222222222222222222222222" as Address;
const ESCROW = "0x00000000000000000000000000000000000000ee" as Address;

type Position = {
  recipient: Address;
  asset: Address;
  amount: bigint;
  withdrawAvailableAt: bigint;
  redeemableUntil: bigint;
  released: boolean;
  claimed: boolean;
};

const EMPTY_POSITION: Position = {
  recipient: zeroAddress,
  asset: zeroAddress,
  amount: 0n,
  withdrawAvailableAt: 0n,
  redeemableUntil: 0n,
  released: false,
  claimed: false,
};

// Chain state each test arranges before calling in.
let owner: Address = HOLDER;
let hasToken = true;
let soulbound: boolean | Error = false;
let position: Position = EMPTY_POSITION;
let available = true;
const writes: { functionName: string; args: unknown[] }[] = [];

function fakeRead(_ctx: unknown, _address: string, _abi: unknown, functionName: string): unknown {
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return TLD_NODE;
  if (functionName === "tld") return ".paseo";
  if (functionName === "owner") return owner;
  if (functionName === "exists") return hasToken;
  if (functionName === "isSoulbound") {
    if (soulbound instanceof Error) throw soulbound;
    return soulbound;
  }
  if (functionName === "getReleasePosition") return position;
  if (functionName === "available") return available;
  if (functionName === "ownerOf") return owner;
  if (functionName === "quoteTransferFee") return 0n;
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
const { releaseName } = await import("../../../src/commands/escrow");
const { transferName } = await import("../../../src/cli/transfer");
const { ensureDomainNotRegistered } = await import("../../../src/commands/register");

const ctx = {
  clientWrapper: { resolveOwnEvmAddress: async () => HOLDER },
  origin: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  nativeTokenDecimals: 10,
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRAR: "0x00000000000000000000000000000000000000bb",
    DOTNS_REGISTRY: "0x00000000000000000000000000000000000000cc",
    DOTNS_NAME_ESCROW: ESCROW,
  },
} as unknown as realContext.DotnsContext;

const now = () => BigInt(Math.floor(Date.now() / 1000));

function heldPosition(overrides: Partial<Position> = {}): Position {
  return { ...EMPTY_POSITION, recipient: HOLDER, amount: 5n, ...overrides };
}

beforeEach(() => {
  owner = HOLDER;
  hasToken = true;
  soulbound = false;
  position = EMPTY_POSITION;
  available = true;
  writes.length = 0;
  clearTldInfoCache();
});

describe("releaseName refuses before the approve", () => {
  test("a name that is not registered", async () => {
    owner = zeroAddress;
    hasToken = false;
    await expect(releaseName(ctx, "alice")).rejects.toThrow("is not registered");
    expect(writes).toEqual([]);
  });

  test("a subname or lite name, which has no registrar token", async () => {
    hasToken = false;
    await expect(releaseName(ctx, "alice")).rejects.toThrow("no token to release");
    expect(writes).toEqual([]);
  });

  test("a soulbound personhood name", async () => {
    soulbound = true;
    await expect(releaseName(ctx, "alice")).rejects.toThrow("soulbound");
    expect(writes).toEqual([]);
  });

  test("a failed soulbound read, rather than treating it as not soulbound", async () => {
    soulbound = new Error("RPC timeout");
    await expect(releaseName(ctx, "alice")).rejects.toThrow("RPC timeout");
    expect(writes).toEqual([]);
  });

  test("a name with no escrow position", async () => {
    await expect(releaseName(ctx, "alice")).rejects.toThrow("no escrow position");
    expect(writes).toEqual([]);
  });

  test("a name already released, saying until when the holder may redeem", async () => {
    position = heldPosition({ released: true, redeemableUntil: now() + 3_600n });
    await expect(releaseName(ctx, "alice")).rejects.toThrow(
      /already released; redeemable by the previous holder until/,
    );
    expect(writes).toEqual([]);
  });

  test("a name owned by another account", async () => {
    owner = STRANGER;
    position = heldPosition({ recipient: STRANGER });
    await expect(releaseName(ctx, "alice")).rejects.toThrow(`owned by ${STRANGER}`);
    expect(writes).toEqual([]);
  });

  test("otherwise approves the escrow and then releases", async () => {
    position = heldPosition();
    const result = await releaseName(ctx, "alice.paseo");
    expect(writes.map((w) => w.functionName)).toEqual(["approve", "release"]);
    expect(writes[0]!.args).toEqual([ESCROW, result.tokenId]);
    expect(writes[1]!.args).toEqual([result.tokenId]);
  });
});

describe("transferName refuses before the write", () => {
  test("a subname or lite name, which has no registrar token", async () => {
    hasToken = false;
    await expect(transferName(ctx, "alice", STRANGER)).rejects.toThrow("no token to transfer");
    expect(writes).toEqual([]);
  });

  test("a soulbound personhood name", async () => {
    soulbound = true;
    await expect(transferName(ctx, "alice", STRANGER)).rejects.toThrow("soulbound");
    expect(writes).toEqual([]);
  });

  test("a name owned by another account", async () => {
    owner = STRANGER;
    await expect(transferName(ctx, "alice", HOLDER)).rejects.toThrow(`owned by ${STRANGER}`);
    expect(writes).toEqual([]);
  });

  test("otherwise submits the transfer", async () => {
    const result = await transferName(ctx, "alice", STRANGER);
    expect(result.name).toBe("alice.paseo");
    expect(writes.map((w) => w.functionName)).toEqual(["transferFrom"]);
  });
});

describe("ensureDomainNotRegistered", () => {
  test("explains a name inside its redeem window and when registration opens", async () => {
    available = false;
    position = heldPosition({ released: true, redeemableUntil: 1_200n });
    await expect(ensureDomainNotRegistered(ctx, "alice")).rejects.toThrow(
      "reserved for its previous holder until 1970-01-01T00:20:00.000Z",
    );
  });

  test("does not mention a redeem window for a held, unreleased name", async () => {
    available = false;
    position = heldPosition();
    await expect(ensureDomainNotRegistered(ctx, "alice")).rejects.toThrow(
      "alice.paseo is already registered.",
    );
  });
});
