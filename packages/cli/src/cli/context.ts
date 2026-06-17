import chalk from "chalk";
import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import { type Address } from "viem";
import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadotClient";
import { formatNativeBalance } from "../utils/formatting";
import {
  resolveRpc,
  resolveBulletinRpc,
  resolveKeystorePath,
  resolveDotnsEnvironment,
  resolveSignerKind,
  resolveQrAppId,
  resolveQrPeopleEndpoints,
  assertSignerOptions,
} from "./env";
import { createQrSigner } from "./qrSigner";
import { step } from "./ui";
import {
  resolveAuthSource,
  createAccountFromSource,
  createSubstrateSigner,
} from "../commands/auth";
import type {
  AssetHubContext,
  BulletinContext,
  ChainContext,
  ReadOnlyContext,
} from "../types/types";
import { DEFAULT_NATIVE_TOKEN_DECIMALS } from "../utils/constants";
import { createDotnsContext, type DotnsContext, type OperationStatus } from "../core/context";

type BuildContextOptions = {
  onStatus?: (status: OperationStatus) => void;
  signal?: AbortSignal;
};

// Bridges a connected CLI AssetHubContext onto the core DotnsContext that every
// operation takes. Origin and signer travel together, so the signing account can
// never be mismatched against the charged origin.
export function buildDotnsContext(
  context: AssetHubContext,
  opts?: BuildContextOptions,
): DotnsContext {
  return createDotnsContext({
    clientWrapper: context.clientWrapper,
    origin: context.substrateAddress,
    signer: context.signer,
    environment: context.environment,
    nativeTokenDecimals: context.nativeTokenDecimals,
    onStatus: opts?.onStatus,
    signal: opts?.signal,
  });
}

// Read-only variant for CLI commands that resolve a ReadOnlyContext: no signer, so
// only reads are callable (writes throw MissingSignerError, which is correct here).
export function buildReadOnlyDotnsContext(
  context: ReadOnlyContext,
  opts?: BuildContextOptions,
): DotnsContext {
  return createDotnsContext({
    clientWrapper: context.clientWrapper,
    origin: context.account.address,
    environment: context.environment,
    nativeTokenDecimals: context.nativeTokenDecimals,
    onStatus: opts?.onStatus,
    signal: opts?.signal,
  });
}

function resolveRpcEnvironment(options: any): string | undefined {
  return options.env ?? options.network;
}

function warnIfDefaultSigner(resolvedFrom: string): void {
  if (resolvedFrom === "default") {
    console.warn(
      "Warning: no account configured, signing with the shared public dev account that anyone can control. " +
        "Set DOTNS_MNEMONIC / DOTNS_KEY_URI or run 'dotns auth set'.",
    );
  }
}

async function logFreeBalance(
  client: any,
  substrateAddress: string,
  nativeTokenDecimals: number,
  nativeTokenSymbol: string,
): Promise<void> {
  try {
    const accountInfo = await client.query.System.Account.getValue(substrateAddress);
    const free = accountInfo?.data?.free as bigint | undefined;
    console.log(
      chalk.gray("  Balance:   ") +
        (free !== undefined
          ? chalk.white(`${formatNativeBalance(free, nativeTokenDecimals)} ${nativeTokenSymbol}`)
          : chalk.yellow("(unavailable)")),
    );
  } catch {
    console.log(chalk.gray("  Balance:   ") + chalk.yellow("(unavailable)"));
  }
}

function firstPropertyValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export async function getChainTokenInfo(rawClient: PolkadotClient): Promise<{
  nativeTokenDecimals: number;
  nativeTokenSymbol: string;
}> {
  const properties = (await rawClient.getChainSpecData()).properties ?? {};
  const decimals = Number(firstPropertyValue(properties.tokenDecimals));
  const symbol = firstPropertyValue(properties.tokenSymbol);

  return {
    nativeTokenDecimals:
      Number.isInteger(decimals) && decimals >= 0 ? decimals : DEFAULT_NATIVE_TOKEN_DECIMALS,
    nativeTokenSymbol: typeof symbol === "string" && symbol.length > 0 ? symbol : "PAS",
  };
}

export async function displayAccountInformation(
  client: PolkadotApiClient,
  evmAddress: Address,
  substrateAddress: string,
  nativeTokenDecimals: number = DEFAULT_NATIVE_TOKEN_DECIMALS,
  nativeTokenSymbol: string = "PAS",
): Promise<void> {
  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);

  console.log(chalk.bold("\n📋 Account Information\n"));
  console.log(chalk.gray("  substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  evm:       ") + chalk.white(evmAddress));
  console.log(chalk.gray("  nonce:     ") + chalk.white(accountInfo.nonce.toString()));
  console.log(chalk.gray("  consumers: ") + chalk.white(accountInfo.consumers.toString()));
  console.log(chalk.gray("  providers: ") + chalk.white(accountInfo.providers.toString()));
  console.log(
    chalk.gray("  free:      ") +
      chalk.green(
        `${formatNativeBalance(accountInfo.data.free, nativeTokenDecimals)} ${nativeTokenSymbol}`,
      ),
  );
  console.log(
    chalk.gray("  reserved:  ") +
      chalk.white(
        `${formatNativeBalance(accountInfo.data.reserved, nativeTokenDecimals)} ${nativeTokenSymbol}`,
      ),
  );
  console.log(
    chalk.gray("  frozen:    ") +
      chalk.white(
        `${formatNativeBalance(accountInfo.data.frozen, nativeTokenDecimals)} ${nativeTokenSymbol}`,
      ),
  );
}

type ConnectionAndAuth = {
  keystorePath: string;
  rawClient: PolkadotClient;
  tokenInfo: { nativeTokenDecimals: number; nativeTokenSymbol: string };
  auth: Awaited<ReturnType<typeof resolveAuthSource>>;
  account: Awaited<ReturnType<typeof createAccountFromSource>>;
  substrateAddress: string;
  signer: ReturnType<typeof createSubstrateSigner>;
};

// Connect to `rpc`, read token metadata, resolve the account and build its signer:
// the work shared by every chain context regardless of descriptor.
async function connectAndAuthenticate(options: any, rpc: string): Promise<ConnectionAndAuth> {
  assertSignerOptions(options);
  const keystorePath = resolveKeystorePath(options.keystorePath);

  const rawClient = await step(`Connecting RPC ${rpc}`, async () =>
    createClient(getWsProvider(rpc)),
  );
  const tokenInfo = await step("Reading chain token metadata", async () =>
    getChainTokenInfo(rawClient),
  );

  if (resolveSignerKind(options.signer) === "qr") {
    const { origin, signer } = await step("Pairing mobile wallet", async () =>
      createQrSigner({
        appId: resolveQrAppId(options.qrAppId),
        endpoints: resolveQrPeopleEndpoints(options.qrPeopleRpc),
        fresh: options.qrFresh,
      }),
    );
    // Only `.account.address` is read downstream, so the placeholder cast is safe. credential
    // keys the retry cache; the wallet has no local secret, so the deterministic origin is used.
    return {
      keystorePath,
      rawClient,
      tokenInfo,
      auth: {
        source: origin,
        isKeyUri: false,
        resolvedFrom: "cli",
        account: "qr-wallet",
        credential: origin,
      },
      account: { address: origin } as Awaited<ReturnType<typeof createAccountFromSource>>,
      substrateAddress: origin,
      signer,
    };
  }

  const auth = await step("Resolving account", async () =>
    resolveAuthSource({
      mnemonic: options.mnemonic,
      keyUri: options.keyUri,
      keystorePath,
      account: options.account,
      password: options.password,
    }),
  );

  warnIfDefaultSigner(auth.resolvedFrom);
  const account = await step("Loading keypair", async () =>
    createAccountFromSource(auth.source, auth.isKeyUri),
  );

  return {
    keystorePath,
    rawClient,
    tokenInfo,
    auth,
    account,
    substrateAddress: account.address,
    signer: createSubstrateSigner(account),
  };
}

function logConfiguration(params: {
  environmentLabel: string;
  rpc: string;
  chainLabel: string;
  tokenInfo: { nativeTokenDecimals: number; nativeTokenSymbol: string };
  substrateAddress: string;
  evmAddress?: string;
  authResolvedFrom: string;
  authAccount: string;
}): void {
  console.log(chalk.bold("\n📋 Configuration\n"));
  console.log(chalk.gray("  Env:       ") + chalk.white(params.environmentLabel));
  console.log(chalk.gray("  RPC:       ") + chalk.white(params.rpc));
  console.log(chalk.gray("  Chain:     ") + chalk.white(params.chainLabel));
  console.log(
    chalk.gray("  Token:     ") +
      chalk.white(
        `${params.tokenInfo.nativeTokenSymbol} (${params.tokenInfo.nativeTokenDecimals} decimals)`,
      ),
  );
  console.log(chalk.gray("  Substrate: ") + chalk.white(params.substrateAddress));
  if (params.evmAddress) {
    console.log(chalk.gray("  EVM:       ") + chalk.white(params.evmAddress));
  }
  console.log(chalk.gray("  Auth:      ") + chalk.white(params.authResolvedFrom));
  console.log(chalk.gray("  Account:   ") + chalk.white(params.authAccount));
}

export async function prepareAssetHubContext(options: any): Promise<AssetHubContext> {
  const environment = resolveDotnsEnvironment(resolveRpcEnvironment(options));
  const rpc = resolveRpc(options.rpc, environment.id);
  const { keystorePath, rawClient, tokenInfo, auth, account, substrateAddress, signer } =
    await connectAndAuthenticate(options, rpc);

  const client = rawClient.getTypedApi(paseo);
  const clientWrapper = new ReviveClientWrapper(client as PolkadotApiClient);
  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper.getEvmAddress(substrateAddress),
  );

  // Idempotent: submits map_account only when unmapped, so a mapped account incurs no signature.
  await step("Ensuring account mapped", async () =>
    clientWrapper.ensureAccountMapped(substrateAddress, signer),
  );

  logConfiguration({
    environmentLabel: environment.label,
    rpc,
    chainLabel: "Polkadot Hub TestNet",
    tokenInfo,
    substrateAddress,
    evmAddress,
    authResolvedFrom: auth.resolvedFrom,
    authAccount: auth.account,
  });
  await logFreeBalance(
    client,
    substrateAddress,
    tokenInfo.nativeTokenDecimals,
    tokenInfo.nativeTokenSymbol,
  );

  return {
    useBulletin: false,
    environment: environment.id,
    rpc,
    keystorePath,
    auth,
    account,
    substrateAddress,
    signer,
    evmAddress,
    nativeTokenDecimals: tokenInfo.nativeTokenDecimals,
    nativeTokenSymbol: tokenInfo.nativeTokenSymbol,
    client: client as PolkadotApiClient,
    clientWrapper,
  };
}

async function prepareBulletinContext(options: any): Promise<BulletinContext> {
  const environment = resolveDotnsEnvironment(resolveRpcEnvironment(options));
  const rpc = resolveBulletinRpc(options.bulletinRpc ?? options.rpc, environment.id);
  const { keystorePath, rawClient, tokenInfo, auth, account, substrateAddress, signer } =
    await connectAndAuthenticate(options, rpc);

  const client = rawClient.getTypedApi(bulletin);

  logConfiguration({
    environmentLabel: environment.label,
    rpc,
    chainLabel: "Bulletin",
    tokenInfo,
    substrateAddress,
    authResolvedFrom: auth.resolvedFrom,
    authAccount: auth.account,
  });
  await logFreeBalance(
    client,
    substrateAddress,
    tokenInfo.nativeTokenDecimals,
    tokenInfo.nativeTokenSymbol,
  );

  return {
    useBulletin: true,
    environment: environment.id,
    rpc,
    keystorePath,
    auth,
    account,
    substrateAddress,
    signer,
    nativeTokenDecimals: tokenInfo.nativeTokenDecimals,
    nativeTokenSymbol: tokenInfo.nativeTokenSymbol,
    evmAddress: null,
    client: client,
    clientWrapper: null,
  };
}

export async function prepareContext(options: any): Promise<ChainContext> {
  const useBulletin = options.useBulletin ?? false;

  if (useBulletin) {
    return prepareBulletinContext(options);
  }

  return prepareAssetHubContext(options);
}
