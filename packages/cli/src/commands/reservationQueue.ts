import { getAddress, keccak256, stringToBytes, zeroAddress, type Address, type Hex } from "viem";
import { type DotnsContext, read, write } from "../core/context";
import { normaliseName } from "../core/naming";
import { DOTNS_POP_CONTROLLER_ABI, POP_RULES_ABI } from "../utils/constants";
import { baseLabelOf, isPersonhoodLabel } from "../utils/validation";
import { readChainNowSeconds } from "./register";

// A personhood name's reservation queue on the PoP controller. Users join it through the
// gateway pallet, and only the user at its front can claim the name. A reservation that
// expires, or that its user leaves, stays in the queue until a call clears it from the front.
// Clearing stops at the first active reservation and moves PopRules' reservation of the name
// to that user, so the name opens to public registration only when clearing empties the queue.
export type ReservationQueueState = {
  // The personhood name the queue belongs to.
  label: string;
  // Index of the queue's front entry.
  head: bigint;
  // Index one past the queue's last entry.
  tail: bigint;
  // Entries from the front to the back, counting expired and emptied ones.
  entries: bigint;
  // Whether the front entry is an active reservation, so its user can claim the name.
  frontActive: boolean;
  // The first user in the queue with an active reservation, at the front or behind it, or null.
  nextHolder: Address | null;
  // Whether PopRules reports the name reserved, which closes it to public registration.
  blocked: boolean;
  // Whether clearing would remove anything: the queue has entries and its front is not active.
  clearable: boolean;
  // Whether clearing would empty the queue and release the name: no entry in it is active.
  releasable: boolean;
};

export type ExpireReservationResult = {
  label: string;
  // Entries the call cleared from the front of the queue.
  cleared: bigint;
  // The transaction hash, or null when there was nothing to clear and nothing was sent.
  txHash: Hex | null;
  // The queue after the call.
  queue: ReservationQueueState;
};

// PopRules' reason for refusing a name held by a live reservation.
export const RESERVED_FOR_CLAIM = "Reserved for a device-name holder's personhood claim";

type ReservationQueueMeta = readonly [bigint, bigint];
type ReservationEntry = readonly [Address, bigint];
type BaseNameReservationInfo = readonly [boolean, Address, bigint];

// The personhood name a queue is kept under: a device name's queue is its stem's.
async function personhoodLabelOf(ctx: DotnsContext, name: string): Promise<string> {
  const label = baseLabelOf(await normaliseName(ctx, name));
  if (!isPersonhoodLabel(label)) {
    throw new Error(
      `"${name}" has no reservation queue: personhood names are lowercase letters only`,
    );
  }
  return label;
}

function readPopController<T>(ctx: DotnsContext, functionName: string, args: unknown[]) {
  return read<T>(
    ctx,
    ctx.contracts.DOTNS_POP_CONTROLLER,
    DOTNS_POP_CONTROLLER_ABI,
    functionName,
    args,
  );
}

// Reads every entry from the front to the back. A queue holds at most the controller's
// MAX_RESERVATION_QUEUE entries, so the reads stay bounded.
async function readQueue(ctx: DotnsContext, label: string): Promise<ReservationQueueState> {
  const labelhash = keccak256(stringToBytes(label));
  const [[head, tail], duration, now, [blocked]] = await Promise.all([
    readPopController<ReservationQueueMeta>(ctx, "reservationMeta", [labelhash]),
    readPopController<bigint>(ctx, "reservationDuration", []),
    readChainNowSeconds(ctx),
    read<BaseNameReservationInfo>(
      ctx,
      ctx.contracts.DOTNS_RULES,
      POP_RULES_ABI,
      "isBaseNameReserved",
      [label],
    ),
  ]);
  const entries = tail > head ? tail - head : 0n;
  const queued = await Promise.all(
    Array.from({ length: Number(entries) }, (_, offset) =>
      readPopController<ReservationEntry>(ctx, "reservationEntry", [
        labelhash,
        head + BigInt(offset),
      ]),
    ),
  );
  // The controller's rule: an entry is active while it has an owner and its reservation
  // has run for no longer than `reservationDuration`.
  const isActive = ([owner, joinedAt]: ReservationEntry) =>
    owner !== zeroAddress && joinedAt + duration >= BigInt(now);
  const firstActive = queued.findIndex(isActive);
  const frontActive = firstActive === 0;
  return {
    label,
    head,
    tail,
    entries,
    frontActive,
    nextHolder: firstActive === -1 ? null : getAddress(queued[firstActive]![0]),
    blocked,
    clearable: entries > 0n && !frontActive,
    releasable: entries > 0n && firstActive === -1,
  };
}

// Reads the reservation queue of `name`, or of its stem for a device name.
export async function getReservationQueue(
  ctx: DotnsContext,
  name: string,
): Promise<ReservationQueueState> {
  return readQueue(ctx, await personhoodLabelOf(ctx, name));
}

// Clears every expired or emptied reservation from the front of the queue of `name`, up to
// the first active one, through the controller's permissionless `expireReservation`. When
// that one exists, PopRules' reservation of the name moves to its user; when none does, the
// queue empties and the name is released. When the queue is empty or its front is active
// there is nothing to clear, so nothing is sent.
export async function expireReservation(
  ctx: DotnsContext,
  name: string,
): Promise<ExpireReservationResult> {
  const label = await personhoodLabelOf(ctx, name);
  const before = await readQueue(ctx, label);
  if (!before.clearable) return { label, cleared: 0n, txHash: null, queue: before };

  const txHash = await write(
    ctx,
    ctx.contracts.DOTNS_POP_CONTROLLER,
    0n,
    DOTNS_POP_CONTROLLER_ABI,
    "expireReservation",
    [label],
    "Clearing expired reservations on",
  );
  const queue = await readQueue(ctx, label);
  // Counted from entries, since the tail never moves in a clear. Up to v1.0.0 the controller
  // deletes the queue's meta once it empties, so the head reads 0 again afterwards.
  return { label, cleared: before.entries - queue.entries, txHash, queue };
}

// What clearing the queue would do, in a sentence, or null when there is nothing to clear.
export function describeClearing(queue: ReservationQueueState): string | null {
  if (!queue.clearable) return null;
  if (queue.releasable) {
    return `No reservation in its queue is active: "dotns pop expire ${queue.label}" empties the queue and releases the name.`;
  }
  const reopens = queue.blocked ? "" : ", closing the name to registration again";
  return `Clearing the front with "dotns pop expire ${queue.label}" moves the reservation to ${queue.nextHolder}, and PopRules reserves the name for them${reopens}.`;
}

// Why PopRules refused to price a name it reports reserved, read from the name's queue: the
// user holding an active reservation in it, or, when none is active, how to release the name
// and reveal the commitment already made. Null when the queue explains nothing.
export function explainReservedRefusal(queue: ReservationQueueState): string | null {
  if (queue.nextHolder !== null) {
    return `${queue.nextHolder} holds an active reservation in its queue.`;
  }
  if (queue.releasable) {
    return `No reservation in its queue is active: run "dotns pop expire ${queue.label}" to release the name, then "dotns register retry ${queue.label}" to reveal your commitment.`;
  }
  return null;
}
