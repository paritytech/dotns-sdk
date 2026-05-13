import { Command } from "commander";
import chalk from "chalk";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadotClient";
import type { AccountInfoOptions, CommandOptions } from "../../types/types";
import { displayAccountInformation, prepareContext, prepareAssetHubContext } from "../context";
import { addAuthOptions } from "./authOptions";
import { resolveRpc, resolveKeystorePath } from "../env";
import { formatErrorMessage } from "../../utils/formatting";
import { resolveAuthSource, createAccountFromSource } from "../../commands/auth";
import { step } from "../ui";
import { prepareReadOnlyContext } from "./lookup";
import { getJsonFlag, getMergedOptions, maybeQuiet } from "./jsonHelpers";
import {
  checkAccountMapped,
  checkWhitelisted,
  whitelistAddress,
} from "../../commands/accountChecks";

export function attachAccountCommands(root: Command) {
  const accountCommand = root.command("account").description("Account management utilities");

  addAuthOptions(accountCommand);

  const addressCommand = accountCommand
    .command("address")
    .description("Print the substrate address for the configured account (offline, no RPC)");

  addAuthOptions(addressCommand).action(async (options: CommandOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);
      const keystorePath = resolveKeystorePath(mergedOptions.keystorePath);

      const auth = await resolveAuthSource({
        mnemonic: mergedOptions.mnemonic,
        keyUri: mergedOptions.keyUri,
        keystorePath,
        account: mergedOptions.account,
        password: mergedOptions.password,
      });

      const account = await createAccountFromSource(auth.source, auth.isKeyUri);
      console.log(account.address);
      process.exit(0);
    } catch (error) {
      console.error(formatErrorMessage(error));
      process.exit(1);
    }
  });

  const infoCommand = accountCommand
    .command("info")
    .description("Display account information including balances");

  addAuthOptions(infoCommand).action(async (options: AccountInfoOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);

      const environment = mergedOptions.env ?? mergedOptions.network;
      const rpc = resolveRpc(mergedOptions.rpc, environment);
      const keystorePath = resolveKeystorePath(mergedOptions.keystorePath);

      const client = await step(`Connecting RPC ${rpc}`, async () =>
        createClient(getWsProvider(rpc)).getTypedApi(paseo),
      );

      const clientWrapper = new ReviveClientWrapper(client as PolkadotApiClient);

      const auth = await step("Resolving account", async () =>
        resolveAuthSource({
          mnemonic: mergedOptions.mnemonic,
          keyUri: mergedOptions.keyUri,
          keystorePath,
          account: mergedOptions.account,
          password: mergedOptions.password,
        }),
      );

      const context = await prepareContext(mergedOptions);

      const evmAddress = await step("Resolving EVM address", async () =>
        clientWrapper.getEvmAddress(context.substrateAddress),
      );

      console.log(chalk.gray("\n  Auth:      ") + chalk.white(auth.resolvedFrom));
      console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

      await displayAccountInformation(
        client as PolkadotApiClient,
        evmAddress,
        context.substrateAddress,
        context.nativeTokenDecimals,
        context.nativeTokenSymbol,
      );

      console.log(chalk.green("\n✓ Complete\n"));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  const mapCommand = accountCommand
    .command("map")
    .description("Map Substrate account to EVM address");

  addAuthOptions(mapCommand).action(async (options: AccountInfoOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);

      const environment = mergedOptions.env ?? mergedOptions.network;
      const rpc = resolveRpc(mergedOptions.rpc, environment);

      const client = await step(`Connecting RPC ${rpc}`, async () =>
        createClient(getWsProvider(rpc)).getTypedApi(paseo),
      );

      const clientWrapper = new ReviveClientWrapper(client as PolkadotApiClient);

      const context = await prepareContext(mergedOptions);

      console.log(chalk.blue("\n▶ Account Mapping"));
      console.log(chalk.gray("  Substrate: ") + chalk.white(context.substrateAddress));

      const isMapped = await step("Mapping account", async () =>
        clientWrapper.ensureAccountMapped(context.substrateAddress, context.signer),
      );

      const evmAddress = await step("Resolving EVM address", async () =>
        clientWrapper.getEvmAddress(context.substrateAddress),
      );

      console.log(chalk.gray("\n  EVM:       ") + chalk.cyan(evmAddress));

      if (isMapped) {
        console.log(chalk.yellow("\n⚠ Account already mapped\n"));
      } else {
        console.log(chalk.green("\n✓ Account Mapped\n"));
      }

      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  const isMappedCommand = accountCommand
    .command("is-mapped <address>")
    .alias("is")
    .description("Check if a Substrate or EVM address is mapped on-chain")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(isMappedCommand).action(async (address: string, options: any, cmd: any) => {
    const jsonOutput = getJsonFlag(cmd);
    try {
      const mergedOptions = getMergedOptions(cmd, options);
      const { clientWrapper } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(mergedOptions),
      );
      const result = await maybeQuiet(jsonOutput, () => checkAccountMapped(clientWrapper, address));
      if (jsonOutput) console.log(JSON.stringify(result));
      else console.log(chalk.green("\n  Complete\n"));
      process.exit(0);
    } catch (error) {
      if (jsonOutput) console.error(JSON.stringify({ error: formatErrorMessage(error) }));
      else console.error(chalk.red(`\n  Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  const isWhitelistedCommand = accountCommand
    .command("is-whitelisted <address>")
    .alias("iw")
    .description("Check if an address is whitelisted on the DotNS Controller")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(isWhitelistedCommand).action(async (address: string, options: any, cmd: any) => {
    const jsonOutput = getJsonFlag(cmd);
    try {
      const mergedOptions = getMergedOptions(cmd, options);
      const { clientWrapper, account } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(mergedOptions),
      );
      const result = await maybeQuiet(jsonOutput, () =>
        checkWhitelisted(clientWrapper, account.address, address),
      );
      if (jsonOutput) console.log(JSON.stringify(result));
      else console.log(chalk.green("\n  Complete\n"));
      process.exit(0);
    } catch (error) {
      if (jsonOutput) console.error(JSON.stringify({ error: formatErrorMessage(error) }));
      else console.error(chalk.red(`\n  Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  const whitelistCommand = accountCommand
    .command("whitelist <address>")
    .description("Whitelist an address on the DotNS Controller (admin only)")
    .option("-r, --remove", "Remove address from whitelist instead of adding", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(whitelistCommand).action(async (address: string, options: any, cmd: any) => {
    const jsonOutput = getJsonFlag(cmd);
    try {
      const mergedOptions = getMergedOptions(cmd, options);
      const enable = !mergedOptions.remove;
      const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));
      const result = await maybeQuiet(jsonOutput, () =>
        whitelistAddress(
          context.clientWrapper,
          context.substrateAddress,
          context.signer,
          address,
          enable,
        ),
      );
      if (jsonOutput) console.log(JSON.stringify(result));
      else console.log(chalk.green("\n  Complete\n"));
      process.exit(0);
    } catch (error) {
      if (jsonOutput) console.error(JSON.stringify({ error: formatErrorMessage(error) }));
      else console.error(chalk.red(`\n  Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });
}
