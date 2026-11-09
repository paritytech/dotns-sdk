import type { Helia } from "helia";
import { CID } from "multiformats/cid";
import { multiaddr } from "@multiformats/multiaddr";
import { blake2b256 } from "@multiformats/blake2/blake2b";
import { sha256 } from "multiformats/hashes/sha2";
import { from as hasherFrom } from "multiformats/hashes/hasher";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { getActiveDotnsEnvironment } from "../utils/constants";

const keccak256Hasher = hasherFrom({
  name: "keccak-256",
  code: 0x1b,
  encode: (input: Uint8Array) => keccak_256(input),
});

const FETCH_TIMEOUT_MS = 30_000;

export interface HeliaFetchResult {
  data: Uint8Array;
  size: number;
}

function resolveDefaultPeers(): readonly string[] {
  const environment = getActiveDotnsEnvironment();
  if (environment.bulletinP2pPeers.length === 0) {
    throw new Error(`P2P verification has no peers configured for environment '${environment.id}'`);
  }
  return environment.bulletinP2pPeers;
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

let sharedInstance: BulletinHeliaClient | null = null;

export class BulletinHeliaClient {
  private node: Promise<Helia> | null = null;
  private peerAddresses: string[];

  constructor(peerAddresses?: readonly string[]) {
    this.peerAddresses = peerAddresses ? [...peerAddresses] : [...resolveDefaultPeers()];
  }

  private startNode(): Promise<Helia> {
    this.node ??= this.createNode();
    return this.node;
  }

  private async createNode(): Promise<Helia> {
    const allowedPeerIds = extractAllowedPeerIds(this.peerAddresses);

    // The build leaves helia out of the bundle, since its transports load files that
    // sit beside their own modules; importing it here spares every other command the load.
    const { createHelia, libp2pDefaults } = await import("helia");
    const helia = await createHelia({
      hashers: [blake2b256, sha256, keccak256Hasher],
      routers: [],
      libp2p: {
        // Dialing known peers needs identify alone. Helia's default listeners, peer
        // discovery and services open sockets that delay process exit by seconds.
        addresses: { listen: [] },
        peerDiscovery: [],
        services: { identify: libp2pDefaults().services.identify },
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

    await Promise.allSettled(
      this.peerAddresses.map((address) => helia.libp2p.dial(multiaddr(address))),
    );
    return helia;
  }

  async initialize(): Promise<void> {
    await this.startNode();
  }

  // Rejects when `signal` aborts first; by default that is after FETCH_TIMEOUT_MS.
  async fetchBlock(
    cidString: string,
    signal: AbortSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS),
  ): Promise<HeliaFetchResult> {
    const helia = await this.startNode();
    signal.throwIfAborted();

    const chunks: Uint8Array[] = [];
    for await (const chunk of helia.blockstore.get(CID.parse(cidString), { signal })) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) {
      throw new Error("No data received from Bulletin peers");
    }

    const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
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

  // Also stops a node that is still starting, after its peer dials finish.
  async destroy(): Promise<void> {
    const node = this.node;
    this.node = null;
    const helia = await node?.catch(() => null);
    await helia?.stop();
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
