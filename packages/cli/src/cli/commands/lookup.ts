import { Command } from "commander";
import chalk from "chalk";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadotClient";
import {
  performDomainLookup,
  listMyRegisteredNames,
  performOwnerOfLookup,
} from "../../commands/lookup";
import { resolveRpc } from "../env";
import { resolveAuthSourceReadOnly, createAccountFromSource } from "../../commands/auth";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { banner, step } from "../ui";

function createClientWrapper(rpc: string) {
  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo);
  return new ReviveClientWrapper(client as PolkadotApiClient);
}

export async function prepareReadOnlyContext(options: { rpc?: string }) {
  const rpc = resolveRpc(options.rpc);

  banner();

  const clientWrapper = await step(`Connecting RPC ${rpc}`, async () => createClientWrapper(rpc));

  const auth = await step("Resolving read-only account", async () => resolveAuthSourceReadOnly());

  const account = await step("Loading keypair", async () =>
    createAccountFromSource(auth.source, auth.isKeyUri),
  );
  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper!.getEvmAddress(account.address),
  );

  console.log(chalk.gray("\n  RPC:     ") + chalk.white(rpc));
  console.log(chalk.gray("  Account: ") + chalk.white(account.address));

  return { clientWrapper, account, rpc, evmAddress };
}

export function attachLookupCommands(root: Command): void {
  const lookupCommand = root.command("lookup").description("Lookup domain information");

  const lookupNameCommand = lookupCommand
    .command("name [label]")
    .description("Lookup comprehensive domain information")
    .option("-n, --name <label>", "Domain label to lookup (alternative to positional argument)");

  lookupNameCommand.action(
    async (positionalLabel: string | undefined, options: any, cmd: Command) => {
      try {
        const label = options.name || positionalLabel;

        if (!label) {
          console.error(chalk.red("\nError: Domain label is required\n"));
          console.log(chalk.gray("Usage: dotns lookup name <label>"));
          console.log(chalk.gray("   or: dotns lookup name --name <label>"));
          console.log(chalk.gray("   or: dotns lookup --name <label>\n"));
          process.exit(1);
        }

        const commandOptions = getAuthOptions(cmd);
        const { clientWrapper, account } = await prepareReadOnlyContext(commandOptions);

        console.log(chalk.bold("\n▶ Domain Lookup\n"));

        await performDomainLookup(label, account.address, clientWrapper);

        console.log(chalk.green("\n✓ Complete\n"));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    },
  );

  lookupCommand
    .option("-n, --name <label>", "Domain label to lookup")
    .action(async (options: any, cmd: Command) => {
      if (options.name) {
        try {
          const commandOptions = getAuthOptions(cmd);
          const { clientWrapper, account } = await prepareReadOnlyContext(commandOptions);

          console.log(chalk.bold("\n▶ Domain Lookup\n"));

          await performDomainLookup(options.name, account.address, clientWrapper);

          console.log(chalk.green("\n✓ Complete\n"));
          process.exit(0);
        } catch (error) {
          console.error(
            chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
          );
          process.exit(1);
        }
      }
    });

  const ownerOfCommand = lookupCommand
    .command("owner-of <label>")
    .description("Show whether a name is registered and who owns it")
    .alias("oo");

  ownerOfCommand.action(async (label: string, _options: any, cmd: Command) => {
    try {
      const commandOptions = getAuthOptions(cmd);
      const { clientWrapper, account } = await prepareReadOnlyContext(commandOptions);

      console.log(chalk.bold("\n▶ Ownership Lookup\n"));

      await performOwnerOfLookup(label, account.address, clientWrapper);

      console.log(chalk.green("\n✓ Complete\n"));
      process.exit(0);
    } catch (error) {
      console.error(
        chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  });

  const listCommand = root.command("list").description("List all names registered by your account");

  addAuthOptions(listCommand).action(async (_options: any, cmd: Command) => {
    try {
      const commandOptions = getAuthOptions(cmd);
      const { clientWrapper, account } = await prepareReadOnlyContext(commandOptions);

      console.log(chalk.bold("\n▶ My Registered Names\n"));

      await listMyRegisteredNames(clientWrapper, account.address);

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
