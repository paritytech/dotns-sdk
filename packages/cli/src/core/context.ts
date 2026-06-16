import type { Abi, Address, Hex } from "viem";
import type { PolkadotSigner } from "polkadot-api";
import type { ReviveClientWrapper } from "../client/polkadotClient";
import type { TransactionStatus } from "../types/types";
import {
  DOTNS_ENVIRONMENTS,
  resolveDotnsEnvironmentId,
  DEFAULT_NATIVE_TOKEN_DECIMALS,
  OPERATION_TIMEOUT_MILLISECONDS,
  type DotnsContractAddresses,
} from "../utils/constants";
import { isValidSubstrateAddress } from "../utils/validation";
import { performContractCall, submitContractTransaction } from "../utils/contractInteractions";
import { withTimeout } from "../utils/formatting";

const DEFAULT_READ_TIMEOUT_MS = 30_000;

export type OperationStatus = TransactionStatus | "reading" | "waiting" | "mapping";

export type DotnsContext = Readonly<{
  clientWrapper: ReviveClientWrapper;
  contracts: Readonly<DotnsContractAddresses>;
  origin: string;
  signer?: PolkadotSigner;
  nativeTokenDecimals: number;
  readTimeoutMs: number;
  opTimeoutMs: number;
  signal?: AbortSignal;
  onStatus: (status: OperationStatus) => void;
}>;

export type CreateDotnsContextOptions = {
  clientWrapper: ReviveClientWrapper;
  origin: string;
  signer?: PolkadotSigner;
  environment?: string;
  nativeTokenDecimals?: number;
  readTimeoutMs?: number;
  opTimeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: OperationStatus) => void;
};

export class MissingSignerError extends Error {
  constructor() {
    super("This operation writes on-chain and requires a signer; create the context with one.");
    this.name = "MissingSignerError";
  }
}

export class UnmappedOriginError extends Error {
  constructor(origin: string, detail?: string) {
    super(detail ?? `Origin ${origin} is not address-mapped on this chain.`);
    this.name = "UnmappedOriginError";
  }
}

export class DomainUnavailableError extends Error {
  constructor(name: string) {
    super(`${name} is already registered.`);
    this.name = "DomainUnavailableError";
  }
}

export function createDotnsContext(options: CreateDotnsContextOptions): DotnsContext {
  if (!isValidSubstrateAddress(options.origin)) {
    throw new Error("createDotnsContext requires an SS58 origin address, not an EVM H160 address");
  }
  const environment = DOTNS_ENVIRONMENTS[resolveDotnsEnvironmentId(options.environment)];
  if (!environment.contracts) {
    throw new Error(`Contract addresses for environment '${environment.id}' are not configured.`);
  }
  return Object.freeze({
    clientWrapper: options.clientWrapper,
    contracts: Object.freeze({ ...environment.contracts }),
    origin: options.origin,
    signer: options.signer,
    nativeTokenDecimals: options.nativeTokenDecimals ?? DEFAULT_NATIVE_TOKEN_DECIMALS,
    readTimeoutMs: options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS,
    opTimeoutMs: options.opTimeoutMs ?? OPERATION_TIMEOUT_MILLISECONDS,
    signal: options.signal,
    onStatus: options.onStatus ?? (() => {}),
  });
}

export function requireSigner(ctx: DotnsContext): PolkadotSigner {
  if (!ctx.signer) throw new MissingSignerError();
  return ctx.signer;
}

export async function read<T>(
  ctx: DotnsContext,
  address: Address,
  abi: Abi,
  functionName: string,
  args: unknown[],
): Promise<T> {
  ctx.onStatus("reading");
  return withTimeout(
    performContractCall<T>(
      ctx.clientWrapper,
      ctx.origin,
      address,
      abi,
      functionName,
      args as any[],
    ),
    ctx.readTimeoutMs,
    functionName,
  );
}

export async function write(
  ctx: DotnsContext,
  address: Address,
  value: bigint,
  abi: Abi,
  functionName: string,
  args: unknown[],
  label: string,
): Promise<Hex> {
  const signer = requireSigner(ctx);
  return submitContractTransaction(
    ctx.clientWrapper,
    address,
    value,
    abi,
    functionName,
    args,
    ctx.origin,
    signer,
    (status) => ctx.onStatus(status),
    label,
    ctx.opTimeoutMs,
    ctx.signal,
  );
}

export async function ownEvmAddress(ctx: DotnsContext): Promise<Address> {
  try {
    return await ctx.clientWrapper.resolveOwnEvmAddress(ctx.origin);
  } catch (error) {
    throw new UnmappedOriginError(ctx.origin, error instanceof Error ? error.message : undefined);
  }
}
