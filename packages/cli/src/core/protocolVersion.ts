import type { Abi, Address } from "viem";
import { type DotnsContext, read } from "./context";
import { DOTNS_REGISTRAR_CONTROLLER_ABI, SUPPORTED_PROTOCOL_VERSIONS } from "../utils/constants";

export { SUPPORTED_PROTOCOL_VERSIONS };

// The newest release this SDK supports; a network declaring a later major.minor is
// refused.
export function newestSupportedProtocolVersion(): string {
  const newest = SUPPORTED_PROTOCOL_VERSIONS.at(-1);
  if (!newest) throw new Error("SUPPORTED_PROTOCOL_VERSIONS is empty");
  return newest;
}

// Minimal view surface of DotnsProtocolRegistry for the version declaration.
const PROTOCOL_VERSION_ABI = [
  {
    type: "function",
    name: "protocolVersion",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const satisfies Abi;

// How a declared protocol version relates to the releases this SDK supports:
//   supported:  one of SUPPORTED_PROTOCOL_VERSIONS.
//   undeclared: the network declares nothing, as deployments before 0.8.0 do.
//   unknown:    a release this SDK does not list, within the newest major.minor it
//               supports (a later patch), or older than it. Usable, with a warning.
//   newer:      a major.minor beyond the newest supported release. Its contracts may
//               have changed in ways this SDK cannot read or write correctly.
export type ProtocolVersionVerdict =
  | Readonly<{ kind: "supported" | "unknown" | "newer"; declared: string }>
  | Readonly<{ kind: "undeclared"; declared: null }>;

type ParsedVersion = Readonly<{ major: number; minor: number; patch: number }>;

// A prerelease or build suffix is allowed, so `2.0.0-rc.1` reads as 2.0 and a
// prerelease of a newer release is refused like the release itself.
function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareMajorMinor(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  return 0;
}

// Pure classification, so callers and tests can reason about a version without a
// chain. A declaration that does not parse as `major.minor.patch` is unknown:
// refusing on malformed input would lock users out of a network whose only fault
// is its formatting.
export function classifyProtocolVersion(declared: string | null): ProtocolVersionVerdict {
  if (declared === null || declared.trim() === "") return { kind: "undeclared", declared: null };
  const value = declared.trim();
  if ((SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value)) {
    return { kind: "supported", declared: value };
  }
  const parsed = parseVersion(value);
  const newest = parseVersion(newestSupportedProtocolVersion());
  if (parsed && newest && compareMajorMinor(parsed, newest) > 0) {
    return { kind: "newer", declared: value };
  }
  return { kind: "unknown", declared: value };
}

// Reads the protocol version the connected network declares. Returns null when the
// network declares none: deployments before 0.8.0 have no `protocolVersion()`, so
// the call reverts, and a registry that was never declared returns an empty string.
// Any other failed read of the declaration also returns null, so the check never
// blocks a network it cannot read; resolving the registry address still throws.
export async function readProtocolVersion(ctx: DotnsContext): Promise<string | null> {
  const protocolRegistry = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
  try {
    const declared = await read<string>(
      ctx,
      protocolRegistry,
      PROTOCOL_VERSION_ABI,
      "protocolVersion",
      [],
    );
    return declared.trim() === "" ? null : declared;
  } catch {
    return null;
  }
}

export class UnsupportedProtocolVersionError extends Error {
  readonly declared: string;

  constructor(declared: string) {
    super(
      `The network runs dotNS protocol ${declared}, newer than ` +
        `${newestSupportedProtocolVersion()}, the newest release ` +
        `this version of the SDK supports. Upgrade the SDK before using this network.`,
    );
    this.name = "UnsupportedProtocolVersionError";
    this.declared = declared;
  }
}

// Reads and classifies the network's declared version, and refuses a newer one by
// throwing UnsupportedProtocolVersionError. Every other verdict is returned for the
// caller to report: `unknown` deserves a warning, `supported` and `undeclared` none.
export async function checkProtocolVersion(ctx: DotnsContext): Promise<ProtocolVersionVerdict> {
  const verdict = classifyProtocolVersion(await readProtocolVersion(ctx));
  if (verdict.kind === "newer") throw new UnsupportedProtocolVersionError(verdict.declared);
  return verdict;
}
