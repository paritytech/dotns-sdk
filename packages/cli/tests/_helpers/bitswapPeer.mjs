// A libp2p peer that serves one raw block over Bitswap on a local WebSocket
// address. Prints `{ "address", "cid" }` as one JSON line once it listens, then
// serves until the process is killed. Run it with Node.

import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { Helia } from "@helia/utils";
import { bitswap } from "@helia/block-brokers";
import { MemoryBlockstore } from "blockstore-core";
import { MemoryDatastore } from "datastore-core";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const datastore = new MemoryDatastore();
const libp2p = await createLibp2p({
  datastore,
  addresses: { listen: ["/ip4/127.0.0.1/tcp/0/ws"] },
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
  hashers: [sha256],
});
await helia.start();

const block = new TextEncoder().encode(process.argv[2] ?? "bulletin block");
const cid = CID.createV1(raw.code, await sha256.digest(block));
await helia.blockstore.put(cid, block);
console.log(JSON.stringify({ address: libp2p.getMultiaddrs()[0].toString(), cid: cid.toString() }));
