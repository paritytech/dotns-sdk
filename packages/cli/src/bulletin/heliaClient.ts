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

// A Helia node that fetches blocks over Bitswap. It has no routers or peer
// discovery, so it dials only the peer addresses it is given.
// One node per client: after `destroy` the client is unusable.
export class BulletinHeliaClient {
  private readonly peerAddresses: readonly string[];
  private helia: Helia<Libp2p> | null = null;
  private connection: Promise<Helia<Libp2p>> | null = null;

  constructor(peerAddresses: readonly string[] = getActiveDotnsEnvironment().bulletinP2pPeers) {
    this.peerAddresses = peerAddresses;
  }

  // Resolves once at least one peer is connected; rejects with every dial error otherwise.
  private async connect(): Promise<Helia<Libp2p>> {
    if (this.peerAddresses.length === 0) {
      throw new Error("no Bulletin P2P peers are configured for this environment");
    }
    const datastore = new MemoryDatastore();
    const libp2p = await createLibp2p({
      datastore,
      transports: [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: { identify: identify() },
    });
    const helia = new Helia({
      libp2p,
      datastore,
      blockstore: new MemoryBlockstore(),
      blockBrokers: [bitswap()],
      hashers: [blake2b256, sha256, keccak256Hasher],
    });
    this.helia = helia;
    await helia.start();

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

  // Rejects once `signal` aborts (by default after FETCH_TIMEOUT_MS); an abort during the
  // peer dials takes effect when they finish.
  async fetchBlock(
    cidString: string,
    signal: AbortSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS),
  ): Promise<Uint8Array> {
    const cid = CID.parse(cidString);
    this.connection ??= this.connect();
    const helia = await this.connection;
    signal.throwIfAborted();

    const chunks: Uint8Array[] = [];
    for await (const chunk of helia.blockstore.get(cid, { signal })) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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
    await this.helia?.stop();
  }
}
