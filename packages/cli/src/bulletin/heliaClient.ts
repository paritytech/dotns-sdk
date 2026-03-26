import { createHelia, type Helia } from "helia";
import { createLibp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { bootstrap } from "@libp2p/bootstrap";
import { kadDHT, removePrivateAddressesMapper } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import type { DhtAnnounceResult } from "../types/types";
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

export const PASEO_BULLETIN_PEERS = [
  "/dns4/paseo-bulletin-collator-node-0.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWRuKisocQ2Z5hBZagV5YGxJMYuW13xT42sUiUCWf5bRtu",
  "/dns4/paseo-bulletin-collator-node-1.parity-testnet.parity.io/tcp/443/wss/p2p/12D3KooWSgdX2egCUiXtDUNV6hGh6JrtTb9vQ6iRfFMdnTemQDDp",
  "/dns4/paseo-bulletin-rpc-node-0.polkadot.io/tcp/443/wss/p2p/12D3KooWG7dt8yAMBaNrWh5juvHMGvJtPKTCaS87kkadWZKpV7ox",
  "/dns4/paseo-bulletin-rpc-node-1.polkadot.io/tcp/443/wss/p2p/12D3KooWSS9QNRiLGBoZrDrtXvPyBV7QrV7F3A1V8f6xAXECSnj5",
];

const IPFS_BOOTSTRAP_PEERS = [
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
  "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
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

const DHT_ANNOUNCE_BATCH_SIZE = 50;
const DHT_PROVIDE_TIMEOUT_MS = 30_000;

export class DhtHeliaClient {
  private helia: Helia | null = null;
  private peerAddresses: string[];

  constructor(peerAddresses: string[] = PASEO_BULLETIN_PEERS) {
    this.peerAddresses = peerAddresses;
  }

  async initialize(): Promise<void> {
    if (this.helia) return;

    const datastore = new MemoryDatastore();
    const blockstore = new MemoryBlockstore();

    const libp2p = await createLibp2p({
      addresses: { listen: ["/ip4/0.0.0.0/tcp/0"] },
      transports: [tcp(), webSockets()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
      peerDiscovery: [bootstrap({ list: [...IPFS_BOOTSTRAP_PEERS, ...this.peerAddresses] })],
      datastore,
      services: {
        aminoDHT: kadDHT({
          protocol: "/ipfs/kad/1.0.0",
          peerInfoMapper: removePrivateAddressesMapper,
          clientMode: false,
        }),
        identify: identify(),
        ping: ping(),
      },
    });

    this.helia = await createHelia({
      libp2p,
      blockstore,
      datastore,
      hashers: [blake2b256, sha256, keccak256Hasher],
    });

    const dialResults = await Promise.allSettled(
      this.peerAddresses.map((address) => this.helia!.libp2p.dial(multiaddr(address))),
    );

    const connectedCount = dialResults.filter((r) => r.status === "fulfilled").length;
    if (connectedCount === 0) {
      throw new Error("Failed to connect to any Bulletin peer for DHT announcement");
    }
  }

  async putBlock(cid: CID, bytes: Uint8Array): Promise<void> {
    if (!this.helia) throw new Error("DhtHeliaClient not initialized");
    await this.helia.blockstore.put(cid, bytes);
  }

  async announceBlock(cid: CID): Promise<boolean> {
    if (!this.helia) throw new Error("DhtHeliaClient not initialized");
    try {
      await Promise.race([
        this.helia.routing.provide(cid),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("provide-timeout")), DHT_PROVIDE_TIMEOUT_MS),
        ),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async putAndAnnounceBlocks(
    blocks: Array<{ cid: CID; bytes: Uint8Array }>,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<DhtAnnounceResult> {
    if (!this.helia) throw new Error("DhtHeliaClient not initialized");

    let completed = 0;
    let announced = 0;
    let failed = 0;
    for (let i = 0; i < blocks.length; i += DHT_ANNOUNCE_BATCH_SIZE) {
      const batch = blocks.slice(i, i + DHT_ANNOUNCE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (block) => {
          await this.putBlock(block.cid, block.bytes);
          const success = await this.announceBlock(block.cid);
          if (success) {
            announced++;
          } else {
            failed++;
          }
          completed++;
          onProgress?.(completed, blocks.length);
        }),
      );
    }

    return { completed, announced, failed };
  }

  async destroy(): Promise<void> {
    if (this.helia) {
      await this.helia.stop();
      this.helia = null;
    }
  }
}

let sharedDhtInstance: DhtHeliaClient | null = null;

export function getSharedDhtHeliaClient(): DhtHeliaClient {
  if (!sharedDhtInstance) {
    sharedDhtInstance = new DhtHeliaClient();
  }
  return sharedDhtInstance;
}

export async function destroySharedDhtHeliaClient(): Promise<void> {
  if (sharedDhtInstance) {
    await sharedDhtInstance.destroy();
    sharedDhtInstance = null;
  }
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
  const teardowns: Promise<void>[] = [];
  if (sharedInstance) {
    teardowns.push(sharedInstance.destroy());
    sharedInstance = null;
  }
  if (sharedDhtInstance) {
    teardowns.push(sharedDhtInstance.destroy());
    sharedDhtInstance = null;
  }
  await Promise.allSettled(teardowns);
}
