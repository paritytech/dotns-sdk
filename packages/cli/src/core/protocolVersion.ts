import type { Abi, Address } from "viem";
import { type DotnsContext, read } from "./context";
import { DOTNS_REGISTRAR_CONTROLLER_ABI, SUPPORTED_PROTOCOL_VERSIONS } from "../utils/constants";

export { SUPPORTED_PROTOCOL_VERSIONS };

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

// Whether a network's declared protocol version is one this SDK supports. Only an
// exact match is: a network that declares any other release, or none, runs
// contracts this SDK was not built against.
export function isSupportedProtocolVersion(declared: string | null): declared is string {
  return declared !== null && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(declared);
}

// Reads the protocol version the connected network declares, or null when its
// registry declares none (an empty string). A failed read throws: a network whose
// declaration cannot be read cannot be checked.
export async function readProtocolVersion(ctx: DotnsContext): Promise<string | null> {
  const protocolRegistry = await read<Address>(
    ctx,
    ctx.contracts.DOTNS_REGISTRAR_CONTROLLER,
    DOTNS_REGISTRAR_CONTROLLER_ABI,
    "protocolRegistry",
    [],
  );
  const declared = await read<string>(
    ctx,
    protocolRegistry,
    PROTOCOL_VERSION_ABI,
    "protocolVersion",
    [],
  );
  const trimmed = declared.trim();
  return trimmed === "" ? null : trimmed;
}

export class UnsupportedProtocolVersionError extends Error {
  readonly declared: string | null;

  constructor(declared: string | null, cause?: unknown) {
    const supported = SUPPORTED_PROTOCOL_VERSIONS.join(", ");
    const found =
      cause !== undefined
        ? "its dotNS protocol version could not be read"
        : declared === null
          ? "it declares no dotNS protocol version"
          : `it runs dotNS protocol ${declared}`;
    super(
      `This network is not supported: ${found}. This version of the SDK supports ${supported}.`,
      cause !== undefined ? { cause } : undefined,
    );
    this.name = "UnsupportedProtocolVersionError";
    this.declared = declared;
  }
}

// Reads the network's declared version and returns it when supported. Throws
// UnsupportedProtocolVersionError for any other declaration, for none, and when the
// declaration cannot be read.
export async function checkProtocolVersion(ctx: DotnsContext): Promise<string> {
  let declared: string | null;
  try {
    declared = await readProtocolVersion(ctx);
  } catch (error) {
    throw new UnsupportedProtocolVersionError(null, error);
  }
  if (!isSupportedProtocolVersion(declared)) throw new UnsupportedProtocolVersionError(declared);
  return declared;
}
