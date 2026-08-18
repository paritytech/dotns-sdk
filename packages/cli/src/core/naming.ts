import type { Abi, Address, Hex } from "viem";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import { type DotnsContext, read } from "./context";
import { DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { deriveDomainNode, deriveDomainTokenId } from "../utils/contractInteractions";
import { normaliseLabel } from "../utils/validation";

// Minimal view surface of DotnsProtocolRegistry. The full ABI is not synced into
// the SDK because these two immutable getters are all the naming layer needs; the
// TLD is fixed at the registry's initialisation and never changes for a deployment.
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
] as const satisfies Abi;

export type TldInfo = Readonly<{ tldNode: Hex; tld: string }>;

// The TLD is immutable per deployment, so it is safe to resolve once and reuse.
// Keyed first by the chain client, then by the controller address: paseo-v2 and
// previewnet share a controller address in the CREATE3 address book but are
// distinct chains with their own TLD, so the client must be part of the key to
// keep them apart within one process. The promise is cached so concurrent callers
// share one in-flight read.
let tldInfoCache = new WeakMap<ReviveClientWrapper, Map<Address, Promise<TldInfo>>>();

async function fetchTldInfo(ctx: DotnsContext): Promise<TldInfo> {
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

// The namehash of `label` under the active TLD (the on-chain `node`).
export async function domainNode(ctx: DotnsContext, label: string): Promise<Hex> {
  const { tldNode } = await resolveTldInfo(ctx);
  return deriveDomainNode(tldNode, label);
}

// The ERC721 tokenId of `label` under the active TLD.
export async function computeDomainTokenId(ctx: DotnsContext, label: string): Promise<bigint> {
  const { tldNode } = await resolveTldInfo(ctx);
  return deriveDomainTokenId(tldNode, label);
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
