import { afterEach, expect, spyOn, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { BulletinHeliaClient, describeDialError } from "../../../src/bulletin/heliaClient";
import { verificationGateways, verifyCid } from "../../../src/bulletin/ipfs";
import { DOTNS_ENVIRONMENTS, setActiveDotnsEnvironment } from "../../../src/utils/constants";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const PEER_ID = "12D3KooWDGdPBWpytPdNAXDT2KJWwmPXkxvxyQLGc7pRdFWeZnyB";
const GATEWAY = "https://gateway.test";
const polkadot = DOTNS_ENVIRONMENTS.polkadot;
const polkadotPeers = polkadot.bulletinP2pPeers;

afterEach(() => {
  polkadot.bulletinP2pPeers = polkadotPeers;
  setActiveDotnsEnvironment("paseo-v2");
});

async function listen(server: net.Server): Promise<number> {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  return (server.address() as net.AddressInfo).port;
}

test("polkadot verifies over the Bulletin boot nodes", () => {
  expect(polkadot.ipfsGatewayUrl).toBeNull();
  expect(polkadot.bulletinP2pPeers.length).toBeGreaterThan(0);
  for (const peer of polkadot.bulletinP2pPeers) expect(peer).toMatch(/\/wss\/p2p\/12D3KooW/);
});

test("an environment without peers or a gateway fails P2P without probing anything", async () => {
  const fetchSpy = spyOn(globalThis, "fetch");
  setActiveDotnsEnvironment("polkadot");
  polkadot.bulletinP2pPeers = [];

  const verification = await verifyCid(CID, verificationGateways());

  expect(verification).toEqual({
    failures: [
      {
        cid: CID,
        resolvable: false,
        gateway: "p2p/bitswap",
        errorMessage: "no Bulletin P2P peers are configured for this environment",
      },
    ],
  });
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

// Without the dial errors the fetch would wait out its whole timeout for peers
// that never connected.
test("a fetch fails at once with the dial errors when no peer connects", async () => {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  const address = `/ip4/127.0.0.1/tcp/${port}/ws/p2p/${PEER_ID}`;
  const client = new BulletinHeliaClient([address]);

  try {
    const error = await client.fetchBlock(CID).catch((reason: Error) => reason);
    // bun reports "WebSocket connection to … failed"; Node's empty event reads "WebSocket error".
    expect((error as Error).message).toStartWith(
      `could not connect to any Bulletin peer: ${address}: WebSocket `,
    );
  } finally {
    await client.destroy();
  }
});

// Under Node a failed WebSocket dial rejects with an error event whose message and
// inner error message are both empty.
test("a dial error event without a message reads as a WebSocket error", () => {
  expect(describeDialError(new ErrorEvent("error", { error: new TypeError("") }))).toBe(
    "WebSocket error",
  );
  expect(describeDialError(new ErrorEvent("error", { message: "connection refused" }))).toBe(
    "connection refused",
  );
  expect(describeDialError(new Error("dial timed out"))).toBe("dial timed out");
});

// A gateway can answer before the P2P check loads; the node it would start then serves no one.
test("a fetch with an aborted signal starts no node and dials no peer", async () => {
  const sockets: net.Socket[] = [];
  const server = net.createServer((socket) => sockets.push(socket));
  const port = await listen(server);
  const client = new BulletinHeliaClient([`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${PEER_ID}`]);

  try {
    await expect(client.fetchBlock(CID, AbortSignal.abort())).rejects.toThrow();
    await client.destroy();
    expect(sockets).toEqual([]);
  } finally {
    for (const socket of sockets) socket.destroy();
    server.close();
  }
}, 3_000);

// The peer accepts TCP but never answers the WebSocket handshake, so its dial stays
// pending until libp2p's 10 s dial timeout. The gateway answer must not wait for it.
test("a gateway answer returns while a peer dial is still pending", async () => {
  const sockets: net.Socket[] = [];
  const firstConnection = Promise.withResolvers<void>();
  const server = net.createServer((socket) => {
    sockets.push(socket);
    firstConnection.resolve();
  });
  const port = await listen(server);
  setActiveDotnsEnvironment("polkadot");
  polkadot.bulletinP2pPeers = [`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${PEER_ID}`];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
    await firstConnection.promise;
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch);

  try {
    expect(await verifyCid(CID, [GATEWAY])).toEqual({
      success: { cid: CID, resolvable: true, gateway: GATEWAY, statusCode: 200 },
    });
  } finally {
    fetchSpy.mockRestore();
    for (const socket of sockets) socket.destroy();
    server.close();
  }
}, 3_000);

type ServingPeer = { address: string; cid: string };

// The serving peer runs under Node, since a WebSocket listener hosted by bun 1.2 never
// completes the libp2p handshake. The second peer accepts TCP and never answers, so a
// fetch that waited for every dial would take libp2p's 10 s dial timeout.
test("a fetch returns once one peer connects, without waiting for a peer that never answers", async () => {
  const blockText = "bulletin block";
  const servingPeer = spawn(
    "node",
    [path.join(import.meta.dir, "../../_helpers/bitswapPeer.mjs"), blockText],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const sockets: net.Socket[] = [];
  const silentPeer = net.createServer((socket) => sockets.push(socket));
  const silentPort = await listen(silentPeer);

  try {
    const [line] = (await once(
      readline.createInterface({ input: servingPeer.stdout }),
      "line",
    )) as [string];
    const { address, cid } = JSON.parse(line) as ServingPeer;
    const client = new BulletinHeliaClient([
      address,
      `/ip4/127.0.0.1/tcp/${silentPort}/ws/p2p/${PEER_ID}`,
    ]);

    const block = await client.fetchBlock(cid);

    expect(new TextDecoder().decode(block)).toBe(blockText);
    // Not awaited: bun 1.2's WebSocket ignores the peer closing the socket mid-handshake,
    // so the silent dial, and with it `destroy`, lasts until libp2p's dial timeout.
    void client.destroy();
  } finally {
    for (const socket of sockets) socket.destroy();
    silentPeer.close();
    servingPeer.kill();
  }
}, 5_000);
