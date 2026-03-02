import { Command } from "commander";
import chalk from "chalk";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadotClient";
import type { AccountInfoOptions, CommandOptions } from "../../types/types";
import { displayAccountInformation, prepareContext } from "../context";
import { addAuthOptions } from "./authOptions";
import { resolveRpc, resolveKeystorePath } from "../env";
import { resolveAuthSource, createAccountFromSource } from "../../commands/auth";
import { step } from "../ui";

function getMergedOptions<T>(command: Command | undefined, fallback: T): CommandOptions & T {
  const mergedOptions: any = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts();
      for (const key in parentOptions) {
        if (!(key in mergedOptions) && parentOptions[key] !== undefined) {
          mergedOptions[key] = parentOptions[key];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}

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
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

  const infoCommand = accountCommand
    .command("info")
    .description("Display account information including balances");

  addAuthOptions(infoCommand).action(async (options: AccountInfoOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);

      const rpc = resolveRpc(mergedOptions.rpc);
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
      );

      console.log(chalk.green("\n✓ Complete\n"));
      process.exit(0);
    } catch (error) {
      console.error(
        chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  });

  const mapCommand = accountCommand
    .command("map")
    .description("Map Substrate account to EVM address");

  addAuthOptions(mapCommand).action(async (options: AccountInfoOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);

      const rpc = resolveRpc(mergedOptions.rpc);

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
      console.error(
        chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  });
}
