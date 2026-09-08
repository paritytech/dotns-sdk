import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadotClient";
import type { AccountInfoOptions, CommandOptions } from "../../types/types";
import { displayAccountInformation, prepareContext, buildReadOnlyDotnsContext } from "../context";
import { makeOnStatus } from "../txStatus";
import { addAuthOptions } from "./authOptions";
import { resolveRpc, resolveKeystorePath } from "../env";
import { formatErrorMessage } from "../../utils/formatting";
import { resolveAuthSource, createAccountFromSource } from "../../commands/auth";
import { step } from "../ui";
import { prepareReadOnlyContext } from "./lookup";
import { getJsonFlag, getMergedOptions, maybeQuiet } from "./jsonHelpers";
import { checkAccountMapped, getNameGrant, isNameGrantedTo } from "../../commands/accountChecks";

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
        clientWrapper.resolveOwnEvmAddress(context.substrateAddress),
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
        clientWrapper.resolveOwnEvmAddress(context.substrateAddress),
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
      const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, {
        onStatus: makeOnStatus(spinner, "mapping"),
      });
      const result = await maybeQuiet(jsonOutput, () => checkAccountMapped(ctx, address));
      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.gray("\n  address: ") + chalk.white(result.address));
        console.log(chalk.gray("  evm:     ") + chalk.cyan(result.evmAddress));
        console.log(
          chalk.gray("  mapped:  ") +
            (result.isMapped ? chalk.green("true") : chalk.yellow("false")),
        );
        console.log(chalk.green("\n  Complete\n"));
      }
      process.exit(0);
    } catch (error) {
      if (jsonOutput) console.error(JSON.stringify({ error: formatErrorMessage(error) }));
      else console.error(chalk.red(`\n  Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  const grantCommand = accountCommand
    .command("grant <label> [address]")
    .description(
      "Show a name's grant on the name whitelist; with an address, check whether registerReserved would accept it",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(grantCommand).action(
    async (label: string, address: string | undefined, options: any, cmd: any) => {
      const jsonOutput = getJsonFlag(cmd);
      try {
        const mergedOptions = getMergedOptions(cmd, options);
        const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(mergedOptions));
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "name grant"),
        });
        const grant = await maybeQuiet(jsonOutput, () => getNameGrant(ctx, label));
        const grantedTo = address
          ? await maybeQuiet(jsonOutput, () => isNameGrantedTo(ctx, label, address))
          : undefined;
        if (jsonOutput) {
          console.log(JSON.stringify({ ...grant, grantedTo }));
        } else {
          console.log(chalk.gray("\n  label:      ") + chalk.white(grant.label));
          console.log(chalk.gray("  status:     ") + chalk.cyan(grant.status));
          console.log(chalk.gray("  grantee:    ") + chalk.white(grant.grantee));
          console.log(
            chalk.gray("  window:     ") +
              (grant.windowOpen ? chalk.green("open") : chalk.yellow("closed")),
          );
          if (grantedTo !== undefined) {
            console.log(
              chalk.gray("  granted to: ") + (grantedTo ? chalk.green("yes") : chalk.yellow("no")),
            );
          }
          console.log(chalk.green("\n  Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        if (jsonOutput) console.error(JSON.stringify({ error: formatErrorMessage(error) }));
        else console.error(chalk.red(`\n  Error: ${formatErrorMessage(error)}\n`));
        process.exit(1);
      }
    },
  );
}
