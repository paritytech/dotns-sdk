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
import {
  resolveAuthSourceReadOnly,
  resolveAuthSource,
  createAccountFromSource,
} from "../../commands/auth";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { banner, step } from "../ui";
import type {
  AuthSource,
  ReadOnlyContext,
  LookupActionOptions,
  ResolvedReadOnlyAuth,
} from "../../types/types";

function createClientWrapper(rpc: string) {
  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo);
  return new ReviveClientWrapper(client as PolkadotApiClient);
}

function hasAnyAuthHint(opts: AuthSource): boolean {
  return (
    (opts.mnemonic != null && String(opts.mnemonic).length > 0) ||
    (opts.keyUri != null && String(opts.keyUri).length > 0) ||
    (opts.keystorePath != null && String(opts.keystorePath).length > 0) ||
    (opts.account != null && String(opts.account).length > 0) ||
    (opts.password != null && String(opts.password).length > 0)
  );
}

function withReadOnlyPasswordFallback<T extends AuthSource>(opts: T): T {
  const passwordEnv = process.env.DOTNS_KEYSTORE_PASSWORD;
  if (
    (opts.password == null || String(opts.password).length === 0) &&
    passwordEnv &&
    passwordEnv.length > 0
  ) {
    return { ...opts, password: passwordEnv } as T;
  }
  return opts;
}

export async function prepareReadOnlyContext(
  options: AuthSource & { rpc?: string },
): Promise<ReadOnlyContext> {
  const rpc = resolveRpc(options.rpc);

  const clientWrapper = await step(`Connecting RPC ${rpc}`, async () => createClientWrapper(rpc));

  const auth = await step("Resolving read-only account", async () => {
    if (hasAnyAuthHint(options)) {
      const merged = withReadOnlyPasswordFallback(options);
      const resolved = await resolveAuthSource(merged);
      return {
        source: resolved.source,
        isKeyUri: resolved.isKeyUri,
        resolvedFrom: resolved.resolvedFrom,
        account: resolved.account,
      } as ResolvedReadOnlyAuth;
    }
    const resolved = await resolveAuthSourceReadOnly();
    return {
      source: resolved.source,
      isKeyUri: resolved.isKeyUri,
      resolvedFrom: resolved.resolvedFrom,
      account: resolved.account,
    } as ResolvedReadOnlyAuth;
  });

  const keypair = await step("Loading keypair", async () =>
    createAccountFromSource(auth.source, auth.isKeyUri),
  );

  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper.getEvmAddress(keypair.address),
  );

  console.log(chalk.gray("\n  RPC:     ") + chalk.white(rpc));
  console.log(chalk.gray("  Account: ") + chalk.white(keypair.address));

  return { clientWrapper, account: { address: keypair.address }, rpc, evmAddress };
}

export function attachLookupCommands(root: Command): void {
  const lookupCommand = root.command("lookup").description("Lookup domain information");
  addAuthOptions(lookupCommand);

  const lookupNameCommand = lookupCommand
    .command("name [label]")
    .description("Lookup comprehensive domain information")
    .option("-n, --name <label>", "Domain label to lookup (alternative to positional argument)");

  addAuthOptions(lookupNameCommand).action(
    async (positionalLabel: string | undefined, options: any, cmd: any) => {
      try {
        const merged = {
          ...(options ?? {}),
          ...getAuthOptions(cmd),
          __positionalLabel: positionalLabel,
        } as LookupActionOptions;

        const label = merged.name || merged.__positionalLabel;

        if (!label) {
          console.error(chalk.red("\nError: Domain label is required\n"));
          console.log(chalk.gray("Usage: dotns lookup name <label>"));
          console.log(chalk.gray("   or: dotns lookup name --name <label>"));
          console.log(chalk.gray("   or: dotns lookup --name <label>\n"));
          process.exit(1);
        }

        banner();

        const { clientWrapper, account } = await prepareReadOnlyContext(merged);

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
    .action(async (options: any, cmd: any) => {
      if (options.name) {
        try {
          const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;

          banner();

          const { clientWrapper, account } = await prepareReadOnlyContext(merged);

          console.log(chalk.bold("\n▶ Domain Lookup\n"));

          await performDomainLookup(merged.name as string, account.address, clientWrapper);

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

  addAuthOptions(ownerOfCommand).action(async (label: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;

      banner();

      const { clientWrapper, account } = await prepareReadOnlyContext(merged);

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

  addAuthOptions(listCommand).action(async (options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;

      banner();

      const { clientWrapper, account } = await prepareReadOnlyContext(merged);

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
