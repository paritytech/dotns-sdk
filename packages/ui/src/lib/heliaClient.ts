import type { Helia } from "helia";
import { CID } from "multiformats/cid";

let keccak256Hasher: Awaited<ReturnType<typeof createKeccakHasher>> | null = null;

async function createKeccakHasher() {
  const { from: hasherFrom } = await import("multiformats/hashes/hasher");
  const { keccak_256 } = await import("@noble/hashes/sha3.js");
  return hasherFrom({
    name: "keccak-256",
    code: 0x1b,
    encode: (input: Uint8Array) => keccak_256(input),
  });
}

async function getKeccakHasher() {
  if (!keccak256Hasher) {
    keccak256Hasher = await createKeccakHasher();
  }
  return keccak256Hasher;
}

const PASEO_BULLETIN_PEERS = [
  "/dns4/paseo-bulletin-collator-node-0.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWRuKisocQ2Z5hBZagV5YGxJMYuW13xT42sUiUCWf5bRtu",
  "/dns4/paseo-bulletin-collator-node-1.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWSgdX2egCUiXtDUNV6hGh6JrtTb9vQ6iRfFMdnTemQDDp",
  "/dns4/paseo-bulletin-rpc-node-0.polkadot.io/tcp/443/wss/p2p/12D3KooWG7dt8yAMBaNrWh5juvHMGvJtPKTCaS87kkadWZKpV7ox",
  "/dns4/paseo-bulletin-rpc-node-1.polkadot.io/tcp/443/wss/p2p/12D3KooWSS9QNRiLGBoZrDrtXvPyBV7QrV7F3A1V8f6xAXECSnj5",
];

const FETCH_TIMEOUT_MS = 30_000;

export interface HeliaFetchResult {
  data: Uint8Array;
  size: number;
}

export interface HeliaContentFetchResult {
  blob: Blob;
  size: number;
  sniffBytes: Uint8Array;
}

type HeliaFetchOptions = {
  signal?: AbortSignal;
  maxBytes?: number;
};

function extractAllowedPeerIds(peerAddresses: string[]): Set<string> {
  const peerIds = new Set<string>();
  for (const address of peerAddresses) {
    const match = address.match(/\/p2p\/([^/]+)/);
    if (match?.[1]) {
      peerIds.add(match[1]);
    }
  }
  return peerIds;
}

function abortErrorFromSignal(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  if (typeof signal.reason === "string" && signal.reason.length > 0) {
    return new Error(signal.reason);
  }

  return new Error("Request aborted");
}

function ensureWithinByteLimit(totalBytes: number, maxBytes?: number): void {
  if (maxBytes !== undefined && totalBytes > maxBytes) {
    throw new Error(`Content exceeds preview limit of ${maxBytes} bytes`);
  }
}

async function collectAsyncBytes(
  source: AsyncIterable<Uint8Array>,
  options: HeliaFetchOptions,
): Promise<Uint8Array> {
  const { signal, maxBytes } = options;
  const chunks: Uint8Array[] = [];
  const iterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  let completed = false;
  let totalBytes = 0;
  let removeAbortListener: (() => void) | undefined;

  const abortPromise =
    signal &&
    new Promise<never>((_, reject) => {
      const abort = () => reject(abortErrorFromSignal(signal));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      removeAbortListener = () => signal.removeEventListener("abort", abort);
    });

  try {
    while (true) {
      if (signal?.aborted) {
        throw abortErrorFromSignal(signal);
      }

      const result = abortPromise
        ? await Promise.race([iterator.next(), abortPromise])
        : await iterator.next();
      if (result.done) {
        completed = true;
        break;
      }

      totalBytes += result.value.length;
      ensureWithinByteLimit(totalBytes, maxBytes);
      chunks.push(result.value);
    }
  } finally {
    removeAbortListener?.();
    if (!completed) {
      try {
        await iterator.return?.();
      } catch {
        // best-effort cancellation
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error("No data received from Bulletin peers");
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

let sharedInstance: BulletinHeliaClient | null = null;

export class BulletinHeliaClient {
  private helia: Helia | null = null;
  private peerAddresses: string[];

  constructor(peerAddresses: string[] = PASEO_BULLETIN_PEERS) {
    this.peerAddresses = peerAddresses;
  }

  async initialize(): Promise<void> {
    if (this.helia) return;

    const [{ createHelia }, { multiaddr }, { blake2b256 }, { sha256 }] = await Promise.all([
      import("helia"),
      import("@multiformats/multiaddr"),
      import("@multiformats/blake2/blake2b"),
      import("multiformats/hashes/sha2"),
    ]);

    const keccak = await getKeccakHasher();
    const allowedPeerIds = extractAllowedPeerIds(this.peerAddresses);

    this.helia = await createHelia({
      hashers: [blake2b256, sha256, keccak],
      routers: [],
      libp2p: {
        connectionGater: {
          denyDialMultiaddr: async (maAddr) => {
            const address = maAddr.toString();
            const match = address.match(/\/p2p\/([^/]+)/);
            if (match?.[1] && allowedPeerIds.has(match[1])) {
              return false;
            }
            return true;
          },
        },
      },
    });

    for (const address of this.peerAddresses) {
      try {
        await this.helia.libp2p.dial(multiaddr(address));
      } catch {
        continue;
      }
    }
  }

  async fetchBlock(cidString: string, options: HeliaFetchOptions = {}): Promise<HeliaFetchResult> {
    await this.initialize();

    const cid = CID.parse(cidString);
    const blockData = await this.helia!.blockstore.get(cid);
    const signal = options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS);

    let data: Uint8Array;
    if (blockData instanceof Uint8Array && blockData.length > 0) {
      ensureWithinByteLimit(blockData.length, options.maxBytes);
      data = blockData;
    } else if (typeof blockData === "object" && Symbol.asyncIterator in Object(blockData)) {
      data = await collectAsyncBytes(blockData as AsyncIterable<Uint8Array>, {
        signal,
        maxBytes: options.maxBytes,
      });
    } else {
      throw new Error("Unexpected response type from Bulletin peer");
    }

    return { data, size: data.length };
  }

  async fetchContent(
    cidString: string,
    options: HeliaFetchOptions = {},
  ): Promise<HeliaContentFetchResult> {
    await this.initialize();

    const cid = CID.parse(cidString);
    const { unixfs } = await import("@helia/unixfs");
    const fs = unixfs(this.helia!);
    const blobParts: BlobPart[] = [];
    const signal = options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let totalLength = 0;
    let sniffBytes = new Uint8Array(0);

    for await (const chunk of fs.cat(cid, { signal })) {
      totalLength += chunk.length;
      ensureWithinByteLimit(totalLength, options.maxBytes);

      if (sniffBytes.length < 512) {
        const remaining = 512 - sniffBytes.length;
        const slice = chunk.subarray(0, remaining);
        const nextSniffBytes = new Uint8Array(sniffBytes.length + slice.length);
        nextSniffBytes.set(sniffBytes);
        nextSniffBytes.set(slice, sniffBytes.length);
        sniffBytes = nextSniffBytes;
      }

      blobParts.push(new Uint8Array(chunk));
    }

    if (blobParts.length === 0) {
      throw new Error("No content received from Bulletin peers");
    }

    return {
      blob: new Blob(blobParts),
      size: totalLength,
      sniffBytes,
    };
  }

  async verifyCid(cidString: string, options: HeliaFetchOptions = {}): Promise<boolean> {
    try {
      await this.fetchBlock(cidString, options);
      return true;
    } catch {
      return false;
    }
  }

  async destroy(): Promise<void> {
    if (this.helia) {
      await this.helia.stop();
      this.helia = null;
    }
  }
}

export function getSharedHeliaClient(): BulletinHeliaClient {
  if (!sharedInstance) {
    sharedInstance = new BulletinHeliaClient();
  }
  return sharedInstance;
}

export async function destroySharedHeliaClient(): Promise<void> {
  if (sharedInstance) {
    await sharedInstance.destroy();
    sharedInstance = null;
  }
}
