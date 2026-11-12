import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { lightSpecGenesis } from "@parity/trinity-stack";
import { resolveBulletinPeers } from "../../../src/bulletin/bulletinPeers";
import { DOTNS_ENVIRONMENTS } from "../../../src/utils/environments";

const SPEC_URL = "https://specs.example/bulletin/light.json";
const WSS_PEER =
  "/dns4/bulletin.example/tcp/443/wss/p2p/12D3KooWDGdPBWpytPdNAXDT2KJWwmPXkxvxyQLGc7pRdFWeZnyB";
const WS_PEER =
  "/ip4/10.0.0.1/tcp/30334/ws/p2p/12D3KooWC45NgktSLMPQafAhi8TMAtiiatnmNc3Qv6wA74u7YBVc";
const TCP_PEER =
  "/dns/bulletin.example/tcp/30333/p2p/12D3KooWS4ptBbHGritdb1T7JPxKT2EN7FXvqq9rUp12jUvjnqQ1";

afterEach(() => {
  mock.restore();
});

// A light spec listing `bootNodes`. Each test passes a distinct `id`, so no test reads another
// test's cached peers.
function createLightSpec(id: string, bootNodes: unknown): string {
  return JSON.stringify({ id, bootNodes, genesis: { stateRootHash: `0x${"11".repeat(32)}` } });
}

type LightSpecOverrides = { digestInput?: Uint8Array; genesisHash?: string };

// The paseo-v2 descriptor with a Bulletin light spec served at SPEC_URL. By default its sha256
// and the Bulletin genesis hash match the served bytes.
function serveLightSpec(body: string, { digestInput, genesisHash }: LightSpecOverrides = {}) {
  const specBytes = new TextEncoder().encode(body);
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
    input: string | URL | Request,
  ) =>
    String(input) === SPEC_URL
      ? new Response(specBytes)
      : new Response(null, { status: 404 })) as typeof fetch);
  const descriptor = structuredClone(DOTNS_ENVIRONMENTS["paseo-v2"].descriptor);
  const bulletin = descriptor.chains.find((chain) => chain.role === "Bulletin")!;
  bulletin.genesisHash = genesisHash ?? lightSpecGenesis(specBytes);
  bulletin.lightSpec = {
    url: SPEC_URL,
    sha256: `0x${createHash("sha256")
      .update(digestInput ?? specBytes)
      .digest("hex")}`,
  };
  return { descriptor, fetchSpy };
}

// Helia in the CLI dials only over WebSocket.
test("dials the ws and wss boot nodes of the Bulletin light spec and drops plain TCP ones", async () => {
  const { descriptor } = serveLightSpec(createLightSpec("mixed", [WSS_PEER, TCP_PEER, WS_PEER]));

  expect(await resolveBulletinPeers(descriptor)).toEqual([WSS_PEER, WS_PEER]);
});

test("fetches a light spec once per process", async () => {
  const { descriptor, fetchSpy } = serveLightSpec(createLightSpec("cached", [WSS_PEER]));

  await resolveBulletinPeers(descriptor);
  await resolveBulletinPeers(descriptor);

  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

// A tampered spec could point verification at peers that vouch for content Bulletin lacks.
test("rejects a light spec that does not match its sha256", async () => {
  const { descriptor } = serveLightSpec(createLightSpec("tampered", [WSS_PEER]), {
    digestInput: new Uint8Array([1]),
  });

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `Bulletin light spec ${SPEC_URL} is unusable: spec bytes do not match sha256`,
  );
});

test("fails with the stack id when its Bulletin chain does not have a light spec", async () => {
  const { descriptor } = serveLightSpec(createLightSpec("absent", [WSS_PEER]));
  delete descriptor.chains.find((chain) => chain.role === "Bulletin")!.lightSpec;

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `stack ${descriptor.id} does not have a Bulletin light spec to read P2P peers from`,
  );
});

test("fails when the light spec cannot be fetched, and fetches again on the next call", async () => {
  const { descriptor, fetchSpy } = serveLightSpec(createLightSpec("unreachable", [WSS_PEER]));
  descriptor.chains.find((chain) => chain.role === "Bulletin")!.lightSpec!.url =
    "https://specs.example/missing.json";

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    "failed to fetch the Bulletin light spec https://specs.example/missing.json: HTTP 404",
  );
  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow("HTTP 404");
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("fails when the light spec does not list a ws or wss boot node", async () => {
  const { descriptor } = serveLightSpec(createLightSpec("tcp-only", [TCP_PEER]));

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `Bulletin light spec ${SPEC_URL} does not list a /ws or /wss boot node`,
  );
});

// A spec for another chain lists that chain's nodes, which do not serve this Bulletin's data.
test("rejects a light spec for another chain", async () => {
  const otherGenesis = `0x${"22".repeat(32)}`;
  const { descriptor } = serveLightSpec(createLightSpec("other-chain", [WSS_PEER]), {
    genesisHash: otherGenesis,
  });

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `Bulletin light spec ${SPEC_URL} is for another chain`,
  );
});

test("rejects a light spec that is not JSON, naming the spec", async () => {
  const { descriptor } = serveLightSpec("not a chain spec", {
    genesisHash: `0x${"33".repeat(32)}`,
  });

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `Bulletin light spec ${SPEC_URL} is unusable: malformed spec`,
  );
});

test("rejects a light spec whose bootNodes is not a list", async () => {
  const { descriptor } = serveLightSpec(createLightSpec("not-a-list", WSS_PEER));

  await expect(resolveBulletinPeers(descriptor)).rejects.toThrow(
    `Bulletin light spec ${SPEC_URL} does not have a bootNodes list`,
  );
});
