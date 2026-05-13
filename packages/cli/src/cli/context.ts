import chalk from "chalk";
import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import { type Address } from "viem";
import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadotClient";
import { parseNativeBalance, formatNativeBalance } from "../utils/formatting";
import {
  resolveRpc,
  resolveMinBalancePas,
  resolveKeystorePath,
  resolveDotnsEnvironment,
} from "./env";
import { step } from "./ui";
import {
  resolveAuthSource,
  createAccountFromSource,
  createSubstrateSigner,
} from "../commands/auth";
import type { AssetHubContext, BulletinContext, ChainContext, BalanceStatus } from "../types/types";
import { DEFAULT_NATIVE_TOKEN_DECIMALS } from "../utils/constants";

function resolveRpcEnvironment(options: any): string | undefined {
  return options.env ?? options.network;
}

export async function getBalanceStatus(
  client: PolkadotApiClient,
  substrateAddress: string,
  minimumBalancePas: string,
  nativeTokenDecimals: number = DEFAULT_NATIVE_TOKEN_DECIMALS,
): Promise<BalanceStatus> {
  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);
  const current = accountInfo.data.free as bigint;
  const required = parseNativeBalance(minimumBalancePas, nativeTokenDecimals);
  return { ok: current >= required, current, required };
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

export async function prepareAssetHubContext(options: any): Promise<AssetHubContext> {
  const environment = resolveDotnsEnvironment(resolveRpcEnvironment(options));
  const rpc = resolveRpc(options.rpc, environment.id);
  const minBalancePas = resolveMinBalancePas(options.minBalance);
  const keystorePath = resolveKeystorePath(options.keystorePath);

  const rawClient = await step(`Connecting RPC ${rpc}`, async () =>
    createClient(getWsProvider(rpc)),
  );
  const client = rawClient.getTypedApi(paseo);
  const tokenInfo = await step("Reading chain token metadata", async () =>
    getChainTokenInfo(rawClient),
  );

  const auth = await step("Resolving account", async () =>
    resolveAuthSource({
      mnemonic: options.mnemonic,
      keyUri: options.keyUri,
      keystorePath,
      account: options.account,
      password: options.password,
    }),
  );

  const account = await step("Loading keypair", async () =>
    createAccountFromSource(auth.source, auth.isKeyUri),
  );

  const substrateAddress = account.address;
  const signer = createSubstrateSigner(account);

  const clientWrapper = new ReviveClientWrapper(client as PolkadotApiClient);

  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper.getEvmAddress(substrateAddress),
  );

  console.log(chalk.bold("\n📋 Configuration\n"));
  console.log(chalk.gray("  Env:       ") + chalk.white(environment.label));
  console.log(chalk.gray("  RPC:       ") + chalk.white(rpc));
  console.log(chalk.gray("  Chain:     ") + chalk.white("Polkadot Hub TestNet"));
  console.log(
    chalk.gray("  Token:     ") +
      chalk.white(`${tokenInfo.nativeTokenSymbol} (${tokenInfo.nativeTokenDecimals} decimals)`),
  );
  console.log(chalk.gray("  Substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  EVM:       ") + chalk.white(evmAddress));
  console.log(chalk.gray("  Auth:      ") + chalk.white(auth.resolvedFrom));
  console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

  const balance = await step("Checking balance", async () =>
    getBalanceStatus(
      client as PolkadotApiClient,
      substrateAddress,
      minBalancePas,
      tokenInfo.nativeTokenDecimals,
    ),
  );

  if (!balance.ok) {
    console.log(
      chalk.yellow(
        `⚠ Insufficient funds: ${formatNativeBalance(balance.current, tokenInfo.nativeTokenDecimals)} ${tokenInfo.nativeTokenSymbol} (required: ${formatNativeBalance(balance.required, tokenInfo.nativeTokenDecimals)} ${tokenInfo.nativeTokenSymbol})`,
      ),
    );
    throw new Error("Insufficient funds for operation");
  }

  console.log(
    `✔ Balance: ${chalk.green(`${formatNativeBalance(balance.current, tokenInfo.nativeTokenDecimals)} ${tokenInfo.nativeTokenSymbol}`)}`,
  );

  return {
    useBulletin: false,
    environment: environment.id,
    rpc,
    minBalancePas,
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

export async function prepareBulletinContext(options: any): Promise<BulletinContext> {
  const environment = resolveDotnsEnvironment(resolveRpcEnvironment(options));
  const rpc = resolveRpc(options.bulletinRpc ?? options.rpc, environment.id);
  const minBalancePas = resolveMinBalancePas(options.minBalance);
  const keystorePath = resolveKeystorePath(options.keystorePath);

  const rawClient = await step(`Connecting RPC ${rpc}`, async () =>
    createClient(getWsProvider(rpc)),
  );
  const client = rawClient.getTypedApi(bulletin);
  const tokenInfo = await step("Reading chain token metadata", async () =>
    getChainTokenInfo(rawClient),
  );

  const auth = await step("Resolving account", async () =>
    resolveAuthSource({
      mnemonic: options.mnemonic,
      keyUri: options.keyUri,
      keystorePath,
      account: options.account,
      password: options.password,
    }),
  );

  const account = await step("Loading keypair", async () =>
    createAccountFromSource(auth.source, auth.isKeyUri),
  );

  const substrateAddress = account.address;
  const signer = createSubstrateSigner(account);

  console.log(chalk.bold("\n📋 Configuration\n"));
  console.log(chalk.gray("  Env:       ") + chalk.white(environment.label));
  console.log(chalk.gray("  RPC:       ") + chalk.white(rpc));
  console.log(chalk.gray("  Chain:     ") + chalk.white("Bulletin"));
  console.log(
    chalk.gray("  Token:     ") +
      chalk.white(`${tokenInfo.nativeTokenSymbol} (${tokenInfo.nativeTokenDecimals} decimals)`),
  );
  console.log(chalk.gray("  Substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  Auth:      ") + chalk.white(auth.resolvedFrom));
  console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

  try {
    const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);
    if (accountInfo?.data?.free !== undefined) {
      const freeBalance = accountInfo.data.free as bigint;
      console.log(
        chalk.gray("  Balance:   ") +
          chalk.white(
            `${formatNativeBalance(freeBalance, tokenInfo.nativeTokenDecimals)} ${tokenInfo.nativeTokenSymbol}`,
          ),
      );
    }
  } catch {
    console.log(chalk.gray("  Balance:   ") + chalk.yellow("(unavailable)"));
  }

  return {
    useBulletin: true,
    environment: environment.id,
    rpc,
    minBalancePas,
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
