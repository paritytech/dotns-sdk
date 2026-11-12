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
import { formatErrorMessage } from "../utils/formatting";

const keccak256Hasher = hasherFrom({
  name: "keccak-256",
  code: 0x1b,
  encode: (input: Uint8Array) => keccak_256(input),
});

const FETCH_TIMEOUT_MS = 30_000;

// Returns a readable reason for a failed peer dial. A failed WebSocket dial rejects with
// the socket's error event instead of an Error, and under Node its message is empty.
export function describeDialError(reason: unknown): string {
  if (!(reason instanceof Event)) return formatErrorMessage(reason);
  const event = reason as Event & { message?: string; error?: { message?: string } };
  return event.message || event.error?.message || `WebSocket ${event.type}`;
}

// A Helia node that fetches blocks over Bitswap. It has no routers or peer
// discovery, so it dials only the peer addresses passed to the constructor.
// One node per client: after `destroy` the client is unusable.
export class BulletinHeliaClient {
  private helia: Helia<Libp2p> | null = null;
  private connection: Promise<Helia<Libp2p>> | null = null;
  private dialResults: Promise<unknown> | null = null;

  constructor(private readonly peerAddresses: readonly string[]) {}

  // Resolves once the first peer connects; rejects with every dial error when none does.
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

    const dials = this.peerAddresses.map((address) => helia.libp2p.dial(multiaddr(address)));
    this.dialResults = Promise.allSettled(dials);
    try {
      await Promise.any(dials);
    } catch (error) {
      const dialErrors = (error as AggregateError).errors.map(
        (reason, index) => `${this.peerAddresses[index]}: ${describeDialError(reason)}`,
      );
      throw new Error(`could not connect to any Bulletin peer: ${dialErrors.join("; ")}`);
    }
    return helia;
  }

  // Rejects once `signal` aborts (by default after FETCH_TIMEOUT_MS). An already aborted
  // signal starts no node; an abort during the peer dials takes effect once the first peer
  // connects or every dial fails.
  async fetchBlock(
    cidString: string,
    signal: AbortSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS),
  ): Promise<Uint8Array> {
    const cid = CID.parse(cidString);
    signal.throwIfAborted();
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

  // Stops the node once every peer dial finishes. Stopping or aborting a dial midway leaves
  // its WebSocket open, since neither @libp2p/websockets nor the libp2p upgrader closes
  // the connection of a dial that fails partway, and an open socket prevents the process
  // from exiting.
  async destroy(): Promise<void> {
    await this.connection?.catch(() => null);
    await this.dialResults;
    await this.helia?.stop();
  }
}
