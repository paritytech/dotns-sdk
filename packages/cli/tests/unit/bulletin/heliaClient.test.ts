import { afterEach, expect, spyOn, test } from "bun:test";
import net from "node:net";
import { BulletinHeliaClient } from "../../../src/bulletin/heliaClient";
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
    await expect(client.fetchBlock(CID)).rejects.toThrow(
      `could not connect to any Bulletin peer: ${address}:`,
    );
  } finally {
    await client.destroy();
  }
});

// The peer accepts TCP but never answers the WebSocket handshake, so its dial stays
// pending until libp2p's 10 s dial timeout. The gateway answer must not wait for it.
test("a gateway answer returns while a peer dial is still pending", async () => {
  const sockets: net.Socket[] = [];
  const connected = Promise.withResolvers<void>();
  const server = net.createServer((socket) => {
    sockets.push(socket);
    connected.resolve();
  });
  const port = await listen(server);
  setActiveDotnsEnvironment("polkadot");
  polkadot.bulletinP2pPeers = [`/ip4/127.0.0.1/tcp/${port}/ws/p2p/${PEER_ID}`];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
    await connected.promise;
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
