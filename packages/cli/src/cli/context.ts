import chalk from "chalk";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { getPolkadotSigner } from "polkadot-api/signer";
import { bulletin, paseo } from "@polkadot-api/descriptors";
import { type Address } from "viem";
import { ReviveClientWrapper, type PolkadotApiClient } from "../client/polkadotClient";
import { parseNativeBalance, formatNativeBalance } from "../utils/formatting";
import { resolveRpc, resolveMinBalancePas, resolveKeystorePath } from "./env";
import { step } from "./ui";
import { resolveAuthSource, createAccountFromSource } from "../commands/auth";
import type { AssetHubContext, BulletinContext, ChainContext, BalanceStatus } from "../types/types";

export async function getBalanceStatus(
  client: PolkadotApiClient,
  substrateAddress: string,
  minimumBalancePas: string,
): Promise<BalanceStatus> {
  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);
  const current = accountInfo.data.free as bigint;
  const required = parseNativeBalance(minimumBalancePas);
  return { ok: current >= required, current, required };
}

export async function displayAccountInformation(
  client: PolkadotApiClient,
  evmAddress: Address,
  substrateAddress: string,
): Promise<void> {
  const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);

  console.log(chalk.bold("\n📋 Account Information\n"));
  console.log(chalk.gray("  substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  evm:       ") + chalk.white(evmAddress));
  console.log(chalk.gray("  nonce:     ") + chalk.white(accountInfo.nonce.toString()));
  console.log(chalk.gray("  consumers: ") + chalk.white(accountInfo.consumers.toString()));
  console.log(chalk.gray("  providers: ") + chalk.white(accountInfo.providers.toString()));
  console.log(
    chalk.gray("  free:      ") + chalk.green(`${formatNativeBalance(accountInfo.data.free)} PAS`),
  );
  console.log(
    chalk.gray("  reserved:  ") +
      chalk.white(`${formatNativeBalance(accountInfo.data.reserved)} PAS`),
  );
  console.log(
    chalk.gray("  frozen:    ") +
      chalk.white(`${formatNativeBalance(accountInfo.data.frozen)} PAS`),
  );
}

export async function prepareAssetHubContext(options: any): Promise<AssetHubContext> {
  const rpc = resolveRpc(options.rpc);
  const minBalancePas = resolveMinBalancePas(options.minBalance);
  const keystorePath = resolveKeystorePath(options.keystorePath);

  const client = await step(`Connecting RPC ${rpc}`, async () =>
    createClient(getWsProvider(rpc)).getTypedApi(paseo),
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
  const signer = getPolkadotSigner(account.publicKey, "Sr25519", async (input) =>
    account.sign(input),
  );

  const clientWrapper = new ReviveClientWrapper(client as PolkadotApiClient);

  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper.getEvmAddress(substrateAddress),
  );

  console.log(chalk.bold("\n📋 Configuration\n"));
  console.log(chalk.gray("  RPC:       ") + chalk.white(rpc));
  console.log(chalk.gray("  Chain:     ") + chalk.white("Polkadot Hub TestNet"));
  console.log(chalk.gray("  Substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  EVM:       ") + chalk.white(evmAddress));
  console.log(chalk.gray("  Auth:      ") + chalk.white(auth.resolvedFrom));
  console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

  const balance = await step("Checking balance", async () =>
    getBalanceStatus(client as PolkadotApiClient, substrateAddress, minBalancePas),
  );

  if (!balance.ok) {
    console.log(
      chalk.yellow(
        `⚠ Insufficient funds: ${formatNativeBalance(balance.current)} PAS (required: ${formatNativeBalance(balance.required)} PAS)`,
      ),
    );
    throw new Error("Insufficient funds for operation");
  }

  console.log(`✔ Balance: ${chalk.green(`${formatNativeBalance(balance.current)} PAS`)}`);

  return {
    useBulletin: false,
    rpc,
    minBalancePas,
    keystorePath,
    auth,
    account,
    substrateAddress,
    signer,
    evmAddress,
    client: client as PolkadotApiClient,
    clientWrapper,
  };
}

export async function prepareBulletinContext(options: any): Promise<BulletinContext> {
  const rpc = resolveRpc(options.bulletinRpc ?? options.rpc);
  const minBalancePas = resolveMinBalancePas(options.minBalance);
  const keystorePath = resolveKeystorePath(options.keystorePath);

  const client = await step(`Connecting RPC ${rpc}`, async () =>
    createClient(getWsProvider(rpc)).getTypedApi(bulletin),
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
  const signer = getPolkadotSigner(account.publicKey, "Sr25519", async (input) =>
    account.sign(input),
  );

  console.log(chalk.bold("\n📋 Configuration\n"));
  console.log(chalk.gray("  RPC:       ") + chalk.white(rpc));
  console.log(chalk.gray("  Chain:     ") + chalk.white("Bulletin"));
  console.log(chalk.gray("  Substrate: ") + chalk.white(substrateAddress));
  console.log(chalk.gray("  Auth:      ") + chalk.white(auth.resolvedFrom));
  console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

  try {
    const accountInfo = await (client as any).query.System.Account.getValue(substrateAddress);
    if (accountInfo?.data?.free !== undefined) {
      const freeBalance = accountInfo.data.free as bigint;
      console.log(chalk.gray("  Balance:   ") + chalk.white(formatNativeBalance(freeBalance)));
    }
  } catch {
    console.log(chalk.gray("  Balance:   ") + chalk.yellow("(unavailable)"));
  }

  return {
    useBulletin: true,
    rpc,
    minBalancePas,
    keystorePath,
    auth,
    account,
    substrateAddress,
    signer,
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
