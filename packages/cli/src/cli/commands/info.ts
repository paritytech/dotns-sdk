import { Command } from "commander";
import chalk from "chalk";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadot-client";
import type { AccountInfoOptions, CommandOptions } from "../../types/types";
import { displayAccountInformation } from "../context";
import { addAuthOptions } from "./auth-options";
import { resolveRpc, resolveKeystorePath } from "../env";
import { resolveAuthSource, createAccountFromSource } from "../../commands/auth";
import { banner, step } from "../ui";

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

  const infoCommand = accountCommand
    .command("info")
    .description("Display account information including balances");

  addAuthOptions(infoCommand).action(async (options: AccountInfoOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);

      const rpc = resolveRpc(mergedOptions.rpc);
      const keystorePath = resolveKeystorePath(mergedOptions.keystorePath);

      banner();

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

      const account = await step("Loading keypair", async () =>
        createAccountFromSource(auth.source, auth.isKeyUri),
      );

      const substrateAddress = account.address;

      const evmAddress = await step("Resolving EVM address", async () =>
        clientWrapper.getEvmAddress(substrateAddress),
      );

      console.log(chalk.gray("\n  Auth:      ") + chalk.white(auth.resolvedFrom));
      console.log(chalk.gray("  Account:   ") + chalk.white(auth.account));

      await displayAccountInformation(client as PolkadotApiClient, evmAddress, substrateAddress);

      console.log(chalk.green("\n✓ Complete\n"));
      process.exit(0);
    } catch (error) {
      console.error(
        chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  });
}
