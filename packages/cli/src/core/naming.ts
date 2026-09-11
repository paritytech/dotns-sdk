import type { Abi, Address, Hex } from "viem";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { type DotnsContext, read } from "./context";
import { COST_MODEL_REGISTRY_KEY, DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { deriveDomainNode, deriveLegacyLiteNode } from "../utils/contractInteractions";
import { isLitePersonLabel } from "../utils/validation";
import { DOTNS_REGISTRY_ABI } from "../utils/constants";
import { normaliseLabel } from "../utils/validation";

// Minimal view surface of DotnsProtocolRegistry. The full ABI is not synced into
// the SDK because these getters are all the naming layer needs: the immutable TLD
// pair (fixed at initialisation), and get(key) to resolve a component address such
// as the cost-model registry from the deployment's own address book.
const PROTOCOL_REGISTRY_ABI = [
  {
    type: "function",
    name: "tldNode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "tld",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const satisfies Abi;

// Minimal view surface of DotnsCostModelRegistry. currentVersion() identifies the
// live cost-model configuration; a registration must be priced against, and stamped
// with, the version current when its commitment is submitted.
const COST_MODEL_REGISTRY_ABI = [
  {
    type: "function",
    name: "currentVersion",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const satisfies Abi;

export type TldInfo = Readonly<{ tldNode: Hex; tld: string }>;

// The TLD is immutable per deployment, so it is safe to resolve once and reuse.
// Keyed first by the chain client, then by the controller address: paseo-v2 and
// previewnet share a controller address in the CREATE3 address book but are
// distinct chains with their own TLD, so the client must be part of the key to
// keep them apart within one process. The promise is cached so concurrent callers
// share one in-flight read.
let tldInfoCache = new WeakMap<ReviveClientWrapper, Map<Address, Promise<TldInfo>>>();

const TLD_FETCH_ATTEMPTS = 3;
const TLD_RETRY_BASE_DELAY_MS = 300;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readTldInfo(ctx: DotnsContext): Promise<TldInfo> {
  const controller = ctx.contracts.DOTNS_REGISTRAR_CONTROLLER;
  const protocolRegistry = await read<Address>(
    ctx,
    controller,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
  const [tldNode, rawTld] = await Promise.all([
    read<Hex>(ctx, protocolRegistry, PROTOCOL_REGISTRY_ABI, "tldNode", []),
    read<string>(ctx, protocolRegistry, PROTOCOL_REGISTRY_ABI, "tld", []),
  ]);
  // The registry stores the suffix with its leading dot (for example ".paseo");
  // callers here work with the bare label, matching normaliseLabel's `tld` argument.
  const tld = rawTld.startsWith(".") ? rawTld.slice(1) : rawTld;
  return Object.freeze({ tldNode, tld });
}

// The TLD read runs once at the start of a command, so a transient RPC blip
// should not fail the whole command. Retry a few times with a short linear
// backoff before giving up. resolveTldInfo still evicts a failed entry, so a
// later call can try again from scratch.
async function fetchTldInfo(ctx: DotnsContext): Promise<TldInfo> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TLD_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await readTldInfo(ctx);
    } catch (error) {
      lastError = error;
      if (attempt < TLD_FETCH_ATTEMPTS) await delay(TLD_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

// Resolves the active TLD from chain, deriving it from the deployment the context
// points at rather than assuming `.dot`. Cached for the lifetime of the process.
export function resolveTldInfo(ctx: DotnsContext): Promise<TldInfo> {
  let byController = tldInfoCache.get(ctx.clientWrapper);
  if (!byController) {
    byController = new Map();
    tldInfoCache.set(ctx.clientWrapper, byController);
  }
  const key = ctx.contracts.DOTNS_REGISTRAR_CONTROLLER;
  let pending = byController.get(key);
  if (!pending) {
    pending = fetchTldInfo(ctx).catch((error) => {
      // Do not cache failures: a transient read error must not poison later calls.
      byController.delete(key);
      throw error;
    });
    byController.set(key, pending);
  }
  return pending;
}

// Clears the cached TLD. Intended for tests that exercise multiple deployments.
export function clearTldInfoCache(): void {
  tldInfoCache = new WeakMap();
}

// The controller's protocol registry, the address book every deployment component
// is resolved through. Read live (not cached) so it always reflects the context's
// controller.
async function readProtocolRegistry(ctx: DotnsContext): Promise<Address> {
  return read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
}

// The cost model's current version, read fresh each call. Unlike the TLD it is not
// immutable: it changes whenever the cost model is reconfigured, and a commitment
// must bind the version live at commit time, so this must never be cached.
export async function readCurrentPricingVersion(ctx: DotnsContext): Promise<bigint> {
  const protocolRegistry = await readProtocolRegistry(ctx);
  const costModel = await read<Address>(ctx, protocolRegistry, PROTOCOL_REGISTRY_ABI, "get", [
    COST_MODEL_REGISTRY_KEY,
  ]);
  return read<bigint>(ctx, costModel, COST_MODEL_REGISTRY_ABI, "currentVersion", []);
}

// The namehash of `label` under the active TLD (the on-chain `node`).
export async function domainNode(ctx: DotnsContext, label: string): Promise<Hex> {
  const { tldNode } = await resolveTldInfo(ctx);
  if (!isLitePersonLabel(label)) return deriveDomainNode(tldNode, label);
  return resolveLiteNode(ctx, tldNode, label);
}

// A lite name has two possible homes. Deployments on dotns v0.7.0 issue it as a
// subname beneath its numeric container (the plain per-label fold); older
// deployments — and names minted before an in-place upgrade — hold it as one
// flat label under the TLD. The registry says which applies to this name: the
// folded node wins when it has a record, otherwise the legacy node is used
// (which also answers "unregistered" correctly on every deployment).
async function resolveLiteNode(ctx: DotnsContext, tldNode: Hex, label: string): Promise<Hex> {
  const folded = deriveDomainNode(tldNode, label);
  const foldedExists = await read<boolean>(
    ctx,
    ctx.contracts.DOTNS_REGISTRY,
    DOTNS_REGISTRY_ABI,
    "recordExists",
    [folded],
  );
  return foldedExists ? folded : deriveLegacyLiteNode(tldNode, label);
}

// The ERC721 tokenId of `label` under the active TLD.
export async function computeDomainTokenId(ctx: DotnsContext, label: string): Promise<bigint> {
  return BigInt(await domainNode(ctx, label));
}

// The fully-qualified name for display (for example `alice.paseo`), using the TLD
// the deployment actually serves.
export async function formatDomainName(ctx: DotnsContext, label: string): Promise<string> {
  const { tld } = await resolveTldInfo(ctx);
  return `${label}.${tld}`;
}

// Normalise user input to its bare label, stripping the deployment's TLD suffix
// so `alice.paseo` and `alice` both resolve to `alice`.
export async function normaliseName(ctx: DotnsContext, name: string): Promise<string> {
  const { tld } = await resolveTldInfo(ctx);
  return normaliseLabel(name, tld);
}
