import {
  checkSpec,
  DEFAULT_TIMEOUT_MS,
  lightSpecGenesis,
  type Descriptor,
  type SpecFile,
} from "@parity/trinity-stack";
import { chain } from "@parity/trinity-stack/reader";
import { formatErrorMessage } from "../utils/formatting";

const WEBSOCKET_ADDRESS = /[/]wss?([/]|$)/;

type ChainSpecBootNodes = { bootNodes?: unknown };

const peersBySpec = new Map<string, Promise<string[]>>();

/**
 * The `/ws` and `/wss` boot nodes of the stack's Bulletin light spec, fetched once per spec.
 * Fails when the stack does not have a Bulletin light spec, the fetch fails, the bytes do not
 * match the spec's sha256 or are not a chain spec, the spec is for another chain, or its
 * `bootNodes` list does not contain a `/ws` or `/wss` address.
 */
export async function resolveBulletinPeers(descriptor: Descriptor): Promise<string[]> {
  const { lightSpec, genesisHash } = chain(descriptor, "Bulletin");
  if (!lightSpec) {
    throw new Error(
      `stack ${descriptor.id} does not have a Bulletin light spec to read P2P peers from`,
    );
  }
  const cacheKey = `${genesisHash}:${lightSpec.sha256}`;
  let peers = peersBySpec.get(cacheKey);
  if (!peers) {
    peers = fetchWebSocketBootNodes(lightSpec, genesisHash);
    peersBySpec.set(cacheKey, peers);
    peers.catch(() => peersBySpec.delete(cacheKey));
  }
  return peers;
}

async function fetchWebSocketBootNodes(spec: SpecFile, genesisHash: string): Promise<string[]> {
  let bytes: Uint8Array;
  try {
    const response = await fetch(spec.url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new Error(
      `failed to fetch the Bulletin light spec ${spec.url}: ${formatErrorMessage(error)}`,
    );
  }
  // `lightSpecGenesis` also fails on bytes that are not a JSON chain spec.
  let specGenesisHash: string;
  try {
    checkSpec(spec, bytes);
    specGenesisHash = lightSpecGenesis(bytes);
  } catch (error) {
    throw new Error(`Bulletin light spec ${spec.url} is unusable: ${formatErrorMessage(error)}`);
  }
  if (specGenesisHash.toLowerCase() !== genesisHash.toLowerCase()) {
    throw new Error(
      `Bulletin light spec ${spec.url} is for another chain: genesis ${specGenesisHash}, expected ${genesisHash}`,
    );
  }
  const { bootNodes } = JSON.parse(new TextDecoder().decode(bytes)) as ChainSpecBootNodes;
  if (!Array.isArray(bootNodes) || bootNodes.some((address) => typeof address !== "string")) {
    throw new Error(`Bulletin light spec ${spec.url} does not have a bootNodes list`);
  }
  const peers = (bootNodes as string[]).filter((address) => WEBSOCKET_ADDRESS.test(address));
  if (peers.length === 0) {
    throw new Error(`Bulletin light spec ${spec.url} does not list a /ws or /wss boot node`);
  }
  return peers;
}
