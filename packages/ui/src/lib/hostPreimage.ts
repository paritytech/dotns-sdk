import { getPreimageManager, type HexString } from "@parity/product-sdk-host";
import { CID } from "multiformats/cid";
import { blake2b } from "@noble/hashes/blake2.js";
import { HASH_BLAKE2B_256, CODEC_RAW, CODEC_DAG_PB } from "./bulletinUpload";
import { IpfsContentTooLargeError } from "./ipfs";

// Host-first retrieval of Bulletin content. The host preimage manager reads
// stored preimages over its own (light-client-backed) connection, so the papp
// never opens a socket to a gateway or libp2p peer — no per-domain sandbox
// prompts. This module is the single primitive every host-first read builds on.

const DEFAULT_LOOKUP_TIMEOUT_MS = 15_000;

type LookupOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

function toHexString(bytes: Uint8Array): HexString {
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex as HexString;
}

/**
 * Derive the host preimage-storage key for a CID. Bulletin preimages are keyed
 * by their blake2b-256 digest, which is exactly the digest embedded in the CID's
 * multihash (see createCid in bulletinUpload.ts). Nothing in this system emits
 * non-blake2b-256 content, so an unexpected hash code is a bug, not a fallback
 * case — we throw rather than silently mis-deriving a key.
 */
export function derivePreimageKey(cid: string): HexString {
  const { code, digest } = CID.parse(cid).multihash;
  if (code !== HASH_BLAKE2B_256) {
    throw new Error(
      `Unexpected multihash code 0x${code.toString(16)} for CID ${cid}; expected blake2b-256 (0xb220).`,
    );
  }
  return toHexString(digest);
}

/**
 * Confirm fetched bytes actually hash to the CID we asked for. With gateways gone
 * this is the integrity guarantee bitswap used to give us for free: it catches
 * truncation, a key-derivation slip, or a wrong/swapped block during the
 * recursive DAG walk. Hardcodes blake2b-256 (the only hash this system emits) and
 * throws via derivePreimageKey's guard on anything else.
 */
export function blockMatchesCid(bytes: Uint8Array, cid: string): boolean {
  const expected = CID.parse(cid).multihash.digest;
  const actual = blake2b(bytes, { dkLen: 32 });
  if (expected.length !== actual.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return false;
  }
  return true;
}

/**
 * Read a single preimage by key, wrapping the host's subscription-based lookup as
 * a one-shot promise. Resolves with the bytes on the first non-null callback, or
 * null on timeout / abort. Because lookup is a subscription it may fire null
 * before the preimage propagates, so null callbacks are ignored until the timer
 * fires — which doubles as a "wait for propagation" gate. Always unsubscribes.
 */
export async function lookupPreimage(
  key: HexString,
  options: LookupOptions = {},
): Promise<Uint8Array | null> {
  const manager = await getPreimageManager();
  if (!manager) {
    throw new Error("Host storage unavailable — open dotNS inside a Polkadot host.");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;

  return new Promise<Uint8Array | null>((resolve) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const finish = (value: Uint8Array | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      subscription?.unsubscribe();
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const onAbort = (): void => finish(null);

    if (options.signal) {
      if (options.signal.aborted) {
        finish(null);
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    subscription = manager.lookup(key, (preimage) => {
      if (preimage) finish(preimage);
      // null: preimage not yet available — keep the subscription open until timeout.
    });

    // Guard against a synchronous first callback that resolved before assignment.
    if (settled) subscription.unsubscribe();
  });
}

/**
 * Look up a CID's block via the host (deriving the key) and verify integrity.
 * Returns the verified bytes, or null if unavailable. Throws only on an
 * integrity mismatch — bytes that don't hash to their CID are corruption, not a
 * miss, and must not be silently rendered.
 */
export async function lookupCidBlock(
  cid: string,
  options: LookupOptions = {},
): Promise<Uint8Array | null> {
  const bytes = await lookupPreimage(derivePreimageKey(cid), options);
  if (!bytes) return null;
  if (!blockMatchesCid(bytes, cid)) {
    throw new Error(`Integrity check failed: block for ${cid} does not match its hash.`);
  }
  return bytes;
}

// Bound recursion against a malicious/cyclic DAG. Our own uploader emits a
// single level (raw chunks under one root); CLI content may nest deeper, but
// nothing legitimate approaches this.
const MAX_DAG_DEPTH = 32;

type DagReaders = {
  dagPb: typeof import("@ipld/dag-pb");
  UnixFS: typeof import("ipfs-unixfs").UnixFS;
};

let dagReaders: Promise<DagReaders> | null = null;

function getDagReaders(): Promise<DagReaders> {
  dagReaders ??= Promise.all([import("@ipld/dag-pb"), import("ipfs-unixfs")]).then(
    ([dagPb, unixFsModule]) => ({ dagPb, UnixFS: unixFsModule.UnixFS }),
  );
  return dagReaders;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function tooLarge(cid: string, size: number, limit: number): IpfsContentTooLargeError {
  return new IpfsContentTooLargeError({
    gateway: "host",
    url: `host://${cid}`,
    size,
    limit,
    contentType: "application/octet-stream",
  });
}

function enforceMaxBytes(size: number, cid: string, maxBytes?: number): void {
  if (maxBytes != null && size > maxBytes) {
    throw tooLarge(cid, size, maxBytes);
  }
}

type FetchContentOptions = {
  maxBytes?: number;
  signal?: AbortSignal;
};

/**
 * Resolve a CID's full content via the host, walking DAG-PB nodes recursively.
 * Every block is fetched by host lookup and integrity-checked against its own CID
 * (lookupCidBlock). A raw block is a leaf; a DAG-PB node either carries inline
 * UnixFS data (leaf) or links to child blocks (recurse, concatenate in link
 * order). No gateway or libp2p connection — nothing for the sandbox to prompt on.
 */
export async function fetchCidContentViaHost(
  cid: string,
  options: FetchContentOptions = {},
): Promise<Uint8Array> {
  return resolveNode(cid, options, 0);
}

async function resolveNode(
  cid: string,
  options: FetchContentOptions,
  depth: number,
): Promise<Uint8Array> {
  if (depth > MAX_DAG_DEPTH) {
    throw new Error(`DAG nesting exceeds ${MAX_DAG_DEPTH} levels at ${cid}.`);
  }

  const block = await lookupCidBlock(cid, { signal: options.signal });
  if (!block) {
    throw new Error(`Content not retrievable via host for ${cid}.`);
  }

  const code = CID.parse(cid).code;

  if (code === CODEC_RAW) {
    enforceMaxBytes(block.length, cid, options.maxBytes);
    return block;
  }

  if (code !== CODEC_DAG_PB) {
    throw new Error(`Unsupported CID codec 0x${code.toString(16)} for ${cid}.`);
  }

  const { dagPb, UnixFS } = await getDagReaders();
  const node = dagPb.decode(block);

  if (!node.Links || node.Links.length === 0) {
    // Leaf DAG-PB node: the file bytes live inline in the UnixFS Data field.
    const data = node.Data
      ? (UnixFS.unmarshal(node.Data).data ?? new Uint8Array(0))
      : new Uint8Array(0);
    enforceMaxBytes(data.length, cid, options.maxBytes);
    return data;
  }

  // Pre-check the declared total (link Tsizes) against the cap before fetching.
  const declared = node.Links.reduce((sum, link) => sum + (link.Tsize ?? 0), 0);
  if (options.maxBytes != null && declared > options.maxBytes) {
    throw tooLarge(cid, declared, options.maxBytes);
  }

  const parts = await Promise.all(
    node.Links.map((link) => resolveNode(link.Hash.toString(), options, depth + 1)),
  );
  const assembled = concatBytes(parts);
  enforceMaxBytes(assembled.length, cid, options.maxBytes);
  return assembled;
}
