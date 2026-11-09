import { Helia } from "@helia/utils";
import { bitswap } from "@helia/block-brokers";
import { createLibp2p, type Libp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { CID } from "multiformats/cid";
import { multiaddr } from "@multiformats/multiaddr";
import { blake2b256 } from "@multiformats/blake2/blake2b";
import { sha256 } from "multiformats/hashes/sha2";
import { from as hasherFrom } from "multiformats/hashes/hasher";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { getActiveDotnsEnvironment } from "../utils/constants";
import { formatErrorMessage } from "../utils/formatting";

const keccak256Hasher = hasherFrom({
  name: "keccak-256",
  code: 0x1b,
  encode: (input: Uint8Array) => keccak_256(input),
});

const FETCH_TIMEOUT_MS = 30_000;

type HeliaNode = Helia<Libp2p>;

function extractAllowedPeerIds(peerAddresses: readonly string[]): Set<string> {
  const peerIds = new Set<string>();
  for (const address of peerAddresses) {
    const match = address.match(/\/p2p\/([^/]+)/);
    if (match?.[1]) {
      peerIds.add(match[1]);
    }
  }
  return peerIds;
}

// A Helia node that fetches blocks over Bitswap from the configured peers only.
// One node per client: after `destroy` the client is unusable.
export class BulletinHeliaClient {
  private readonly peerAddresses: readonly string[];
  private node: Promise<HeliaNode> | null = null;
  private connection: Promise<HeliaNode> | null = null;

  constructor(peerAddresses: readonly string[] = getActiveDotnsEnvironment().bulletinP2pPeers) {
    this.peerAddresses = peerAddresses;
  }

  // Resolves once at least one peer is connected; rejects with every dial error otherwise.
  async initialize(): Promise<void> {
    await this.connectOnce();
  }

  private connectOnce(): Promise<HeliaNode> {
    this.connection ??= this.connect();
    return this.connection;
  }

  private async connect(): Promise<HeliaNode> {
    if (this.peerAddresses.length === 0) {
      throw new Error("no Bulletin P2P peers are configured for this environment");
    }
    this.node = this.createNode();
    const helia = await this.node;

    const dials = await Promise.allSettled(
      this.peerAddresses.map((address) => helia.libp2p.dial(multiaddr(address))),
    );
    const dialErrors = dials.flatMap((dial, index) =>
      dial.status === "rejected"
        ? [`${this.peerAddresses[index]}: ${formatErrorMessage(dial.reason)}`]
        : [],
    );
    if (dialErrors.length === dials.length) {
      throw new Error(`could not connect to any Bulletin peer: ${dialErrors.join("; ")}`);
    }
    return helia;
  }

  private async createNode(): Promise<HeliaNode> {
    const allowedPeerIds = extractAllowedPeerIds(this.peerAddresses);
    const datastore = new MemoryDatastore();
    const libp2p = await createLibp2p({
      datastore,
      transports: [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: { identify: identify() },
      connectionGater: {
        denyDialMultiaddr: async (maAddr) => {
          const match = maAddr.toString().match(/\/p2p\/([^/]+)/);
          return !(match?.[1] && allowedPeerIds.has(match[1]));
        },
      },
    });
    const helia = new Helia({
      libp2p,
      datastore,
      blockstore: new MemoryBlockstore(),
      blockBrokers: [bitswap()],
      routers: [],
      hashers: [blake2b256, sha256, keccak256Hasher],
    });
    await helia.start();
    return helia;
  }

  // Rejects once `signal` aborts (by default after FETCH_TIMEOUT_MS); an abort during the
  // peer dials takes effect when they finish.
  async fetchBlock(
    cidString: string,
    signal: AbortSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS),
  ): Promise<Uint8Array> {
    const cid = CID.parse(cidString);
    const helia = await this.connectOnce();
    signal.throwIfAborted();

    const chunks: Uint8Array[] = [];
    for await (const chunk of helia.blockstore.get(cid, { signal })) {
      chunks.push(chunk);
    }
    const block = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      block.set(chunk, offset);
      offset += chunk.length;
    }
    return block;
  }

  async verifyCid(cidString: string): Promise<boolean> {
    try {
      await this.fetchBlock(cidString);
      return true;
    } catch {
      return false;
    }
  }

  // Stops the node once its peer dials finish. Stopping or aborting a dial midway leaves
  // its WebSocket open, since neither @libp2p/websockets nor the libp2p upgrader closes
  // the connection of a dial that fails partway, and that socket keeps the process alive.
  async destroy(): Promise<void> {
    await this.connection?.catch(() => null);
    const helia = await this.node?.catch(() => null);
    await helia?.stop();
  }
}
