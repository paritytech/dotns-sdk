import { createHelia, type Helia } from "helia";
import { unixfs } from "@helia/unixfs";
import { CID } from "multiformats/cid";
import { multiaddr } from "@multiformats/multiaddr";
import { blake2b256 } from "@multiformats/blake2/blake2b";
import { sha256 } from "multiformats/hashes/sha2";
import { from as hasherFrom } from "multiformats/hashes/hasher";
import { keccak_256 } from "@noble/hashes/sha3.js";

const keccak256Hasher = hasherFrom({
  name: "keccak-256",
  code: 0x1b,
  encode: (input: Uint8Array) => keccak_256(input),
});

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

async function collectAsyncBytes(
  source: AsyncIterable<Uint8Array>,
  timeoutMs: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`P2P fetch timed out after ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
  });

  const iterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  let done = false;

  while (!done) {
    const result = await Promise.race([iterator.next(), timeout]);
    if (result.done) {
      done = true;
    } else {
      chunks.push(result.value);
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

    const allowedPeerIds = extractAllowedPeerIds(this.peerAddresses);

    this.helia = await createHelia({
      hashers: [blake2b256, sha256, keccak256Hasher],
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

  async fetchBlock(cidString: string): Promise<HeliaFetchResult> {
    await this.initialize();

    const cid = CID.parse(cidString);
    const blockData = await this.helia!.blockstore.get(cid);

    let data: Uint8Array;
    if (blockData instanceof Uint8Array && blockData.length > 0) {
      data = blockData;
    } else if (typeof blockData === "object" && Symbol.asyncIterator in Object(blockData)) {
      data = await collectAsyncBytes(blockData as AsyncIterable<Uint8Array>, FETCH_TIMEOUT_MS);
    } else {
      throw new Error("Unexpected response type from Bulletin peer");
    }

    return { data, size: data.length };
  }

  async fetchContent(cidString: string): Promise<HeliaFetchResult> {
    await this.initialize();

    const cid = CID.parse(cidString);
    const fs = unixfs(this.helia!);
    const chunks: Uint8Array[] = [];

    for await (const chunk of fs.cat(cid, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })) {
      chunks.push(chunk);
    }

    if (chunks.length === 0) {
      throw new Error("No content received from Bulletin peers");
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return { data: merged, size: merged.length };
  }

  async verifyCid(cidString: string): Promise<boolean> {
    try {
      await this.fetchBlock(cidString);
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
