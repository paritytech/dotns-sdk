import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getAddress, keccak256, stringToBytes, zeroAddress } from "viem";
import * as realContext from "../../../src/core/context";

const PASEO_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const ALICE = getAddress("0x00000000000000000000000000000000000000a1");
const BOB = getAddress("0x00000000000000000000000000000000000000b0");
const TX = `0x${"ab".repeat(32)}` as `0x${string}`;
const NOW = 1_000_000n;
const DURATION = 604_800n;
const ACTIVE = NOW - 10n;
const EXPIRED = NOW - DURATION - 1n;

type Entry = readonly [`0x${string}`, bigint];

let head = 0n;
let queue: Entry[] = [];
let blocked = false;
let clearedTo = 0n;
// Up to v1.0.0, emptying a queue deletes its meta, so head and tail both read 0 afterwards.
let metaDeletedOnClear = false;
let writes: unknown[][] = [];
let entryReads: unknown[][] = [];

function fakeRead(
  _ctx: unknown,
  _address: string,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): unknown {
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  if (functionName === "tld") return ".paseo";
  if (functionName === "reservationMeta") {
    return metaDeletedOnClear && writes.length > 0
      ? ([0n, 0n] as const)
      : ([head, BigInt(queue.length)] as const);
  }
  if (functionName === "reservationDuration") return DURATION;
  if (functionName === "reservationEntry") {
    entryReads.push(args);
    return queue[Number(args[1])] ?? ([zeroAddress, 0n] as const);
  }
  if (functionName === "isBaseNameReserved") return [blocked, ALICE, 0n] as const;
  throw new Error(`unexpected read: ${functionName}`);
}

function fakeWrite(
  _ctx: unknown,
  _address: string,
  _value: bigint,
  _abi: unknown,
  functionName: string,
  args: unknown[],
): Promise<string> {
  writes.push([functionName, ...args]);
  head = clearedTo;
  return Promise.resolve(TX);
}

mock.module("../../../src/core/context", () => ({
  ...realContext,
  read: fakeRead,
  write: fakeWrite,
}));

const { clearTldInfoCache } = await import("../../../src/core/naming");
const { describeClearing, expireReservation, explainReservedRefusal, getReservationQueue } =
  await import("../../../src/commands/reservationQueue");

const ctx = {
  clientWrapper: { client: { query: { Timestamp: { Now: { getValue: () => NOW * 1000n } } } } },
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_RULES: "0x00000000000000000000000000000000000000bb",
    DOTNS_POP_CONTROLLER: "0x00000000000000000000000000000000000000cc",
  },
} as unknown as realContext.DotnsContext;

beforeEach(() => {
  head = 0n;
  queue = [];
  blocked = false;
  clearedTo = 0n;
  metaDeletedOnClear = false;
  writes = [];
  entryReads = [];
  clearTldInfoCache();
});

describe("getReservationQueue", () => {
  test("reads a device name's queue under its stem, from the front to the back", async () => {
    head = 1n;
    queue = [
      [ALICE, EXPIRED],
      [zeroAddress, 0n],
      [BOB, ACTIVE],
    ];
    const state = await getReservationQueue(ctx, "andrewsays.42");
    expect(state.label).toBe("andrewsays");
    expect(state.entries).toBe(2n);
    const labelhash = keccak256(stringToBytes("andrewsays"));
    expect(entryReads).toEqual([
      [labelhash, 1n],
      [labelhash, 2n],
    ]);
  });

  test("an expired front with an active user behind it hands the name to that user", async () => {
    blocked = true;
    queue = [
      [ALICE, EXPIRED],
      [BOB, ACTIVE],
    ];
    const state = await getReservationQueue(ctx, "andrewsays");
    expect(state.frontActive).toBe(false);
    expect(state.nextHolder).toBe(BOB);
    expect(state.clearable).toBe(true);
    expect(state.releasable).toBe(false);
    expect(describeClearing(state)).toContain(`moves the reservation to ${BOB}`);
    expect(describeClearing(state)).not.toContain("releases");
  });

  test("a queue with no active entry is released by clearing", async () => {
    blocked = true;
    queue = [
      [ALICE, EXPIRED],
      [zeroAddress, 0n],
      [BOB, EXPIRED],
    ];
    const state = await getReservationQueue(ctx, "andrewsays");
    expect(state.nextHolder).toBeNull();
    expect(state.releasable).toBe(true);
    expect(describeClearing(state)).toContain("releases the name");
  });

  test("an entry is active through its last second", async () => {
    queue = [[ALICE, NOW - DURATION]];
    const state = await getReservationQueue(ctx, "andrewsays");
    expect(state.frontActive).toBe(true);
    expect(state.clearable).toBe(false);
  });

  test("clearing a lapsed reservation ahead of an active user closes the name again", async () => {
    blocked = false;
    queue = [
      [ALICE, EXPIRED],
      [BOB, ACTIVE],
    ];
    const state = await getReservationQueue(ctx, "andrewsays");
    expect(describeClearing(state)).toContain("closing the name to registration again");
  });

  test("a drained queue has no entries and nothing to clear", async () => {
    head = 4n;
    queue = [
      [ALICE, EXPIRED],
      [ALICE, EXPIRED],
      [ALICE, EXPIRED],
      [ALICE, EXPIRED],
    ];
    const state = await getReservationQueue(ctx, "andrewsays");
    expect(state.entries).toBe(0n);
    expect(state.clearable).toBe(false);
    expect(state.releasable).toBe(false);
    expect(describeClearing(state)).toBeNull();
  });

  test("a name that is not a personhood name has no queue", async () => {
    await expect(getReservationQueue(ctx, "web3")).rejects.toThrow(/no reservation queue/);
  });
});

describe("explainReservedRefusal", () => {
  test("names the user holding an active reservation, even behind an expired front", async () => {
    blocked = true;
    queue = [
      [ALICE, EXPIRED],
      [BOB, ACTIVE],
    ];
    const hint = explainReservedRefusal(await getReservationQueue(ctx, "andrewsays"));
    expect(hint).toBe(`${BOB} holds an active reservation in its queue.`);
  });

  test("points to clearing and retrying when no reservation is active", async () => {
    blocked = true;
    queue = [[ALICE, EXPIRED]];
    const hint = explainReservedRefusal(await getReservationQueue(ctx, "andrewsays"));
    expect(hint).toContain('"dotns pop expire andrewsays"');
    expect(hint).toContain('"dotns register retry andrewsays"');
  });

  test("says nothing when the queue is empty", async () => {
    blocked = true;
    expect(explainReservedRefusal(await getReservationQueue(ctx, "andrewsays"))).toBeNull();
  });
});

describe("expireReservation", () => {
  test("clears the front and reports the user it reached", async () => {
    queue = [
      [ALICE, EXPIRED],
      [BOB, ACTIVE],
    ];
    clearedTo = 1n;
    const result = await expireReservation(ctx, "andrewsays.paseo");
    expect(writes).toEqual([["expireReservation", "andrewsays"]]);
    expect(result.txHash).toBe(TX);
    expect(result.cleared).toBe(1n);
    expect(result.queue.frontActive).toBe(true);
    expect(result.queue.nextHolder).toBe(BOB);
  });

  test("counts a clear that empties the queue, when the meta is kept (v1.1.0)", async () => {
    head = 1n;
    queue = [
      [ALICE, EXPIRED],
      [ALICE, EXPIRED],
      [BOB, EXPIRED],
    ];
    clearedTo = 3n;
    const result = await expireReservation(ctx, "andrewsays");
    expect(result.cleared).toBe(2n);
    expect(result.queue.entries).toBe(0n);
  });

  test("counts a clear that empties the queue, when the meta is deleted (v1.0.0 and v0.8.0)", async () => {
    head = 1n;
    queue = [
      [ALICE, EXPIRED],
      [ALICE, EXPIRED],
      [BOB, EXPIRED],
    ];
    metaDeletedOnClear = true;
    const result = await expireReservation(ctx, "andrewsays");
    expect(result.cleared).toBe(2n);
    expect(result.queue.head).toBe(0n);
    expect(result.queue.entries).toBe(0n);
  });

  test("sends nothing when the front is active", async () => {
    queue = [[ALICE, ACTIVE]];
    const result = await expireReservation(ctx, "andrewsays");
    expect(writes).toEqual([]);
    expect(result.txHash).toBeNull();
    expect(result.cleared).toBe(0n);
  });

  test("sends nothing when the queue is empty", async () => {
    const result = await expireReservation(ctx, "andrewsays");
    expect(writes).toEqual([]);
    expect(result.txHash).toBeNull();
  });
});
