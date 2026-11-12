import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  accept,
  decodeLink,
  encodeLink,
  fetchDescriptor,
  isTrinityStackError,
  MAX_DESCRIPTOR_BYTES,
  open,
  parse,
  sameStack,
  stackId,
  webUrl,
  type Descriptor,
  type Pointer,
} from "@parity/trinity-stack";
import { chain, type Bundled } from "@parity/trinity-stack/reader";
import { getAddress, type Address, type Hex } from "viem";
import { stacks } from "../../.trinity/index.js";
import { formatErrorMessage, formatUnixSeconds } from "./formatting";

export type DotnsContractAddresses = {
  /** dotNS domain registrar - handles ownership NFTs */
  DOTNS_REGISTRAR: Address;

  /** Registration controller - manages commit-reveal registration */
  DOTNS_REGISTRAR_CONTROLLER: Address;

  /** stores domain records */
  DOTNS_REGISTRY: Address;

  /** Forward resolution resolver */
  DOTNS_RESOLVER: Address;

  /** Reverse resolution resolver - maps an address to its primary name */
  DOTNS_REVERSE_RESOLVER: Address;

  /** PoP resolver - holds the chat keys and device-to-personhood name links the gateway pallet sets when it issues a name */
  DOTNS_POP_RESOLVER: Address;

  /** Content hash resolver - stores IPFS CIDs */
  DOTNS_CONTENT_RESOLVER: Address;

  /** User store factory - deploys per-user storage contracts */
  STORE_FACTORY: Address;

  /** PopRules - classifies names into status tiers, prices them, and holds base-name reservations */
  DOTNS_RULES: Address;

  /** PoP controller - issues device names and personhood names for the dotNS gateway pallet, and settles names deferred until their owner has a LabelStore */
  DOTNS_POP_CONTROLLER: Address;

  /** Name escrow - holds refundable registration deposits and protocol fees, and runs the release and refund ledgers */
  DOTNS_NAME_ESCROW: Address;

  /** Multicall3 - batch read contract calls */
  MULTICALL3: Address;
};

// The key each address has in a stack descriptor's `dotns` map.
const CONTRACT_KEYS: Record<keyof DotnsContractAddresses, string> = {
  DOTNS_REGISTRAR: "registrar",
  DOTNS_REGISTRAR_CONTROLLER: "controller",
  DOTNS_REGISTRY: "registry",
  DOTNS_RESOLVER: "resolver",
  DOTNS_REVERSE_RESOLVER: "reverseResolver",
  DOTNS_POP_RESOLVER: "popResolver",
  DOTNS_CONTENT_RESOLVER: "contentResolver",
  STORE_FACTORY: "storeFactory",
  DOTNS_RULES: "popRules",
  DOTNS_POP_CONTROLLER: "popController",
  DOTNS_NAME_ESCROW: "nameEscrow",
  MULTICALL3: "multicall3",
};

type StackRequirements = {
  chains: readonly string[];
  services: readonly string[];
  dotns: readonly string[];
};

/**
 * Descriptor fields every command needs: `--stack` rejects a stack that lacks one. A command that
 * uses the Bulletin or People chain fails naming the chain when the stack lacks it, and without
 * an `ipfs-gateway` an upload is verified over P2P only.
 */
const STACK_REQUIREMENTS: StackRequirements = {
  chains: ["AssetHub"],
  services: [],
  dotns: Object.values(CONTRACT_KEYS),
};

/**
 * What the build requires of a bundled copy, so each bundled network runs every command. The web
 * gateway and the Bulletin light spec are optional: without them the CLI omits the web links, and
 * P2P verification falls back to the IPFS gateways.
 */
const BUNDLED_STACK_REQUIREMENTS: StackRequirements = {
  chains: ["AssetHub", "Bulletin", "People"],
  services: ["ipfs-gateway"],
  dotns: STACK_REQUIREMENTS.dotns,
};

export type DotnsEnvironmentConfig = {
  /**
   * `paseo-v2`, `previewnet` or `polkadot` for a bundled stack or a copy signed with its key;
   * otherwise the descriptor's `id` with a suffix derived from the stack, so it never matches
   * a bundled id or another stack's.
   */
  id: string;
  label: string;
  /**
   * For a stack copy bundled with the CLI, the link its stack is published at, where a newer
   * copy may be; `null` for a stack passed with `--stack`.
   */
  publishedLink: string | null;
  descriptor: Descriptor;
  rpc: string;
  /** Checked after connect, so `--rpc`/`DOTNS_RPC` cannot point the address book at another chain. */
  genesisHash: Hex;
  /** Path-style IPFS gateway: content is at `${ipfsGatewayUrl}${cid}`; `null` without one. */
  ipfsGatewayUrl: string | null;
  contracts: DotnsContractAddresses;
};

// Values `--env` accepts for each bundled environment. `DotnsEnvironmentId` derives from its keys,
// since the package does not ship the generated `.trinity` module the stacks come from.
const ALIASES = {
  "paseo-v2": ["paseo-v2", "paseo", "paseo_v2", "paseo-next-v2", "v2", "next", "next-v2"],
  previewnet: ["previewnet", "preview-net", "preview", "ppn"],
  polkadot: ["polkadot", "mainnet", "polkadot-asset-hub", "dot"],
} satisfies Record<keyof typeof stacks, readonly string[]>;

export type DotnsEnvironmentId = keyof typeof ALIASES;

/** An environment that runs from a stack copy bundled with the CLI. */
export type BundledEnvironment = DotnsEnvironmentConfig & {
  id: DotnsEnvironmentId;
  publishedLink: string;
};

const DEFAULT_DOTNS_ENVIRONMENT: DotnsEnvironmentId = "polkadot";

const BUNDLED_IDS = Object.keys(ALIASES) as DotnsEnvironmentId[];

// What an environment takes from outside its descriptor.
type EnvironmentSettings = Pick<DotnsEnvironmentConfig, "id" | "publishedLink">;

/** The environment a descriptor describes; fails listing every field of `requirements` it lacks. */
function buildEnvironment(
  descriptor: Descriptor,
  settings: EnvironmentSettings,
  requirements: StackRequirements = STACK_REQUIREMENTS,
): DotnsEnvironmentConfig {
  const missing = [
    ...requirements.chains
      .filter((role) => !descriptor.chains.some((chain) => chain.role === role))
      .map((role) => `chain ${role}`),
    ...requirements.services
      .filter((kind) => !descriptor.services.some((service) => service.kind === kind))
      .map((kind) => `service ${kind}`),
    ...requirements.dotns.filter((key) => !descriptor.dotns?.[key]).map((key) => `dotns.${key}`),
  ];
  if (missing.length > 0) {
    throw new Error(`stack ${descriptor.id} lacks ${missing.join(", ")}`);
  }
  // The library rejects a `dotns` value that is not a lowercase 20-byte address, so the
  // checksum here cannot fail.
  const contracts = Object.fromEntries(
    Object.entries(CONTRACT_KEYS).map(([name, key]) => [name, getAddress(descriptor.dotns![key]!)]),
  ) as DotnsContractAddresses;
  const assetHub = chain(descriptor, "AssetHub");
  // The RFC requires each chain and service to list at least one URL.
  return {
    ...settings,
    label: descriptor.name,
    descriptor,
    rpc: assetHub.rpc[0]!,
    genesisHash: assetHub.genesisHash as Hex,
    ipfsGatewayUrl:
      descriptor.services.find((service) => service.kind === "ipfs-gateway")?.urls[0] ?? null,
    contracts,
  };
}

/**
 * Each bundled environment, read from `bundled`, the stacks `trinity-stack generate` writes.
 * Fails listing every stack whose copy is missing or lacks a required field. Signatures are
 * checked at build by `assertBundledStacksSigned`.
 */
export function deriveBundledEnvironments(
  bundled: Record<string, Bundled>,
): Record<DotnsEnvironmentId, BundledEnvironment> {
  const environments: Partial<Record<DotnsEnvironmentId, BundledEnvironment>> = {};
  const problems: string[] = [];
  for (const id of BUNDLED_IDS) {
    const copy = bundled[id];
    try {
      if (!copy) throw new Error("copy is missing; add it with trinity-stack add");
      const { descriptor } = parse(new TextEncoder().encode(copy.document));
      const settings = { id, publishedLink: encodeLink(copy.pointer) };
      environments[id] = buildEnvironment(
        descriptor,
        settings,
        BUNDLED_STACK_REQUIREMENTS,
      ) as BundledEnvironment;
    } catch (error) {
      problems.push(`${id}: ${formatErrorMessage(error)}`);
    }
  }
  assertNoBundledStackProblems("unusable", problems);
  return environments as Record<DotnsEnvironmentId, BundledEnvironment>;
}

function assertNoBundledStackProblems(kind: string, problems: string[]): void {
  if (problems.length > 0) {
    throw new Error(`${kind} bundled stacks in .trinity:\n  ${problems.join("\n  ")}`);
  }
}

export const DOTNS_ENVIRONMENTS = deriveBundledEnvironments(stacks);

/** Fails listing every copy in `bundled` that does not verify under its link's key. */
export function assertBundledStacksSigned(bundled: Record<string, Bundled> = stacks): void {
  const problems: string[] = [];
  for (const [id, copy] of Object.entries(bundled)) {
    try {
      open(new TextEncoder().encode(copy.document), copy.pointer);
    } catch (error) {
      problems.push(`${id}: ${formatErrorMessage(error)}`);
    }
  }
  assertNoBundledStackProblems("unsigned", problems);
}

/** The bundled environment `value` is an id or alias of, or `undefined` when there is none. */
export function findDotnsEnvironmentId(value: string): DotnsEnvironmentId | undefined {
  const token = value.trim().toLowerCase().replace(/\s+/g, "-");
  return BUNDLED_IDS.find((id) => ALIASES[id].includes(token));
}

export function resolveDotnsEnvironmentId(value?: string): DotnsEnvironmentId {
  if (!value?.trim()) return DEFAULT_DOTNS_ENVIRONMENT;
  const id = findDotnsEnvironmentId(value);
  if (id) return id;

  throw new Error(
    `Unknown dotNS environment "${value}". Use one of: ${BUNDLED_IDS.join(", ")}, or pass a stack with --stack.`,
  );
}

/** Thrown where an environment is resolved past its stack's `expiresAt`. */
export class StackExpiredError extends Error {
  constructor(
    message: string,
    /** For a bundled copy, the link its stack is published at, where a newer copy may be. */
    readonly publishedLink: string | null,
  ) {
    super(message);
    this.name = "StackExpiredError";
  }
}

/**
 * A bundled environment by id or alias, or `environment` itself when it is already loaded.
 * Fails with `StackExpiredError` when its stack is past `expiresAt`.
 */
export function resolveDotnsEnvironment(
  idOrEnvironment?: string | DotnsEnvironmentConfig,
): DotnsEnvironmentConfig {
  const environment =
    typeof idOrEnvironment === "object"
      ? idOrEnvironment
      : DOTNS_ENVIRONMENTS[resolveDotnsEnvironmentId(idOrEnvironment)];
  const currency = checkStackCurrent(environment);
  if (currency.status === "expired") {
    throw new StackExpiredError(currency.message, currency.publishedLink);
  }
  return environment;
}

/** Whether a stack is current, past its `validUntil` (stale) or past its `expiresAt` (expired). */
export type StackCurrency =
  | { status: "current" }
  | {
      status: "stale" | "expired";
      /** What to report, such as "The Polkadot stack bundled with this CLI expired at …". */
      message: string;
      /** For a bundled copy, the link its stack is published at; `null` otherwise. */
      publishedLink: string | null;
    };

export function checkStackCurrent(
  { descriptor, label, publishedLink }: DotnsEnvironmentConfig,
  now: Date = new Date(),
): StackCurrency {
  const seconds = now.getTime() / 1000;
  const stack = publishedLink ? `The ${label} stack bundled with this CLI` : `The ${label} stack`;
  if (descriptor.expiresAt != null && seconds >= descriptor.expiresAt) {
    const expiresAt = formatUnixSeconds(BigInt(descriptor.expiresAt));
    return { status: "expired", message: `${stack} expired at ${expiresAt}.`, publishedLink };
  }
  if (descriptor.validUntil != null && seconds >= descriptor.validUntil) {
    const validUntil = formatUnixSeconds(BigInt(descriptor.validUntil));
    return {
      status: "stale",
      message: `${stack} is past its validUntil (${validUntil}) and may be outdated.`,
      publishedLink,
    };
  }
  return { status: "current" };
}

/**
 * Fails listing every bundled stack past its `expiresAt`, and returns a warning for each one past
 * its `validUntil`. The build runs it, so a release does not ship an expired copy; a stale one
 * still ships, since only its publisher can sign a newer copy.
 */
export function assertBundledStacksUnexpired(
  environments: Record<string, BundledEnvironment> = DOTNS_ENVIRONMENTS,
): string[] {
  const stale: string[] = [];
  const expired: string[] = [];
  for (const environment of Object.values(environments)) {
    const currency = checkStackCurrent(environment);
    if (currency.status === "current") continue;
    (currency.status === "expired" ? expired : stale).push(
      `${environment.id}: ${currency.message}`,
    );
  }
  assertNoBundledStackProblems("expired", expired);
  return stale;
}

const LINK_PATTERN = /^[a-z][a-z0-9+.-]*:[/][/]/i;

/**
 * The environment of a stack passed as a `polkadotapp://stack` link or another link carrying a
 * pointer, fetched and checked against the link's key; a descriptor URL, fetched without a
 * signature check; or a descriptor file, read without a signature check. A document signed with
 * a bundled stack's key loads as that environment, and fails when its sequence is below the
 * bundled copy's, or equal to it with other content. Fails when a link or URL is unreachable or
 * when the stack lacks a required field (`STACK_REQUIREMENTS`). An expired stack loads, and
 * fails where it is resolved.
 */
export async function loadDotnsStack(source: string): Promise<DotnsEnvironmentConfig> {
  const value = source.trim();
  let pointer: Pointer | undefined;
  if (LINK_PATTERN.test(value)) {
    pointer = new URL(value).searchParams.has("url") ? decodeLink(value) : { url: value };
  }
  let document: Uint8Array;
  try {
    const bytes = pointer ? await fetchDescriptor(pointer.url) : await readFile(value);
    if (!bytes) {
      throw new Error(
        `${pointer!.url} is unreachable: a network error, a non-2xx status, a redirect (not followed), a timeout or a body over ${MAX_DESCRIPTOR_BYTES} bytes`,
      );
    }
    document = bytes;
  } catch (error) {
    throw new Error(`failed to read stack '${value}': ${formatErrorMessage(error)}`);
  }
  try {
    const bundledCopy = findBundledCopy(document, pointer);
    return bundledCopy
      ? loadBundledCopy(bundledCopy.id, bundledCopy.descriptor, document)
      : buildCustomEnvironment(document, pointer);
  } catch (error) {
    throw new Error(`stack '${value}' is unusable: ${formatErrorMessage(error)}`);
  }
}

// The bundled stack whose key signs `document`, with the descriptor it carries. A link that
// carries its own key matches only the bundled stack with that key.
function findBundledCopy(document: Uint8Array, pointer: Pointer | undefined) {
  for (const id of BUNDLED_IDS) {
    const bundledPointer = stacks[id].pointer;
    if (pointer?.key && !sameStack(pointer, bundledPointer)) continue;
    try {
      const { descriptor, signed } = open(document, bundledPointer);
      if (signed) return { id, descriptor };
    } catch (error) {
      if (!isTrinityStackError(error)) throw error;
    }
  }
  return undefined;
}

function loadBundledCopy(id: DotnsEnvironmentId, descriptor: Descriptor, document: Uint8Array) {
  const bundled = stacks[id];
  const bundledDocument = new TextEncoder().encode(bundled.document);
  const acceptance = accept(bundled.pointer, bundledDocument, document);
  if (acceptance.status === "rollback" || acceptance.status === "conflict") {
    const bundledSequence = DOTNS_ENVIRONMENTS[id].descriptor.sequence;
    throw new Error(
      acceptance.status === "rollback"
        ? `its sequence ${descriptor.sequence} is below the bundled copy's ${bundledSequence}`
        : `its sequence ${descriptor.sequence} matches the bundled copy's ${bundledSequence} with other content`,
    );
  }
  if (acceptance.status === "refused") {
    throw new Error(`the descriptor breaks the rule ${acceptance.refused}`);
  }
  return buildEnvironment(acceptance.descriptor, { id, publishedLink: null });
}

// The id is part of registration record file names, so it is reduced to a-z, 0-9 and "-",
// and suffixed with a hash of the stack's identity: the link's key, else its normalised URL;
// a file does not have an identity, so its bytes are hashed.
function buildCustomEnvironment(document: Uint8Array, pointer: Pointer | undefined) {
  const { descriptor } = pointer ? accept(pointer, undefined, document) : parse(document);
  const identity = pointer ? stackId(pointer) : document;
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  const name =
    descriptor.id
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "stack";
  return buildEnvironment(descriptor, { id: `${name}-${hash}`, publishedLink: null });
}

let activeDotnsEnvironment: DotnsEnvironmentConfig = DOTNS_ENVIRONMENTS[DEFAULT_DOTNS_ENVIRONMENT];

/**
 * Makes `environment` the one commands run on. Fails with `StackExpiredError` when its stack is
 * past `expiresAt`; the active environment then stays as it was.
 */
export function setActiveDotnsEnvironment(
  environment?: string | DotnsEnvironmentConfig,
): DotnsEnvironmentConfig {
  activeDotnsEnvironment = resolveDotnsEnvironment(environment);
  return activeDotnsEnvironment;
}

export function getActiveDotnsEnvironment(): DotnsEnvironmentConfig {
  return activeDotnsEnvironment;
}

/**
 * Where the active stack's web gateway serves `label`, a name without its TLD such as `alice`
 * or `blog.alice`, or `undefined` when the stack does not list a web gateway.
 */
export function webGatewayUrl(label: string): string | undefined {
  const { descriptor } = getActiveDotnsEnvironment();
  return webUrl(descriptor, `${label}.${descriptor.tld}`);
}
