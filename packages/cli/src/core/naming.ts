import type { Abi, Address, Hex } from "viem";
import { type DotnsContext, read } from "./context";
import { DOTNS_REGISTRAR_CONTROLLER_ABI } from "../utils/constants";
import { deriveDomainNode, deriveDomainTokenId } from "../utils/contractInteractions";

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
// Keyed by the controller address (the per-environment entry point), which lets a
// single process serve multiple environments without cross-talk. The promise is
// cached so concurrent callers share one in-flight read.
const tldInfoCache = new Map<Address, Promise<TldInfo>>();

async function fetchTldInfo(ctx: DotnsContext): Promise<TldInfo> {
  const controller = ctx.contracts.DOTNS_REGISTRAR_CONTROLLER;
  const protocolRegistry = await read<Address>(
    ctx,
    controller,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
  const [tldNode, tld] = await Promise.all([
    read<Hex>(ctx, protocolRegistry, PROTOCOL_REGISTRY_ABI, "tldNode", []),
    read<string>(ctx, protocolRegistry, PROTOCOL_REGISTRY_ABI, "tld", []),
  ]);
  return Object.freeze({ tldNode, tld });
}

// Resolves the active TLD from chain, deriving it from the deployment the context
// points at rather than assuming `.dot`. Cached for the lifetime of the process.
export function resolveTldInfo(ctx: DotnsContext): Promise<TldInfo> {
  const key = ctx.contracts.DOTNS_REGISTRAR_CONTROLLER;
  let pending = tldInfoCache.get(key);
  if (!pending) {
    pending = fetchTldInfo(ctx).catch((error) => {
      // Do not cache failures: a transient read error must not poison later calls.
      tldInfoCache.delete(key);
      throw error;
    });
    tldInfoCache.set(key, pending);
  }
  return pending;
}

// Clears the cached TLD. Intended for tests that exercise multiple deployments.
export function clearTldInfoCache(): void {
  tldInfoCache.clear();
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
