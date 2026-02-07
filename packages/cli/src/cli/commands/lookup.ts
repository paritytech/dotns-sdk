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
import { maybeQuiet } from "./bulletin";

function createClientWrapper(rpc: string) {
  const client = createClient(getWsProvider(rpc)).getTypedApi(paseo);
  return new ReviveClientWrapper(client as PolkadotApiClient);
}

export function getJsonFlag(command: any): boolean {
  if (command && typeof (command as any).optsWithGlobals === "function") {
    const options = (command as any).optsWithGlobals();
    if (typeof options?.json === "boolean") return options.json;
  }

  const localOptions =
    command && typeof command.opts === "function" ? (command.opts() as any) : undefined;
  if (typeof localOptions?.json === "boolean") return localOptions.json;

  return process.argv.includes("--json");
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
    .option("-n, --name <label>", "Domain label to lookup (alternative to positional argument)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(lookupNameCommand).action(
    async (positionalLabel: string | undefined, options: any, cmd: any) => {
      try {
        const merged = {
          ...(options ?? {}),
          ...getAuthOptions(cmd),
          __positionalLabel: positionalLabel,
        } as LookupActionOptions;

        const label = merged.name || merged.__positionalLabel;
        const jsonOutput = getJsonFlag(merged);

        if (!label) {
          if (jsonOutput) {
            console.error(JSON.stringify({ error: "Domain label is required" }));
            process.exit(1);
          }
          console.error(chalk.red("\nError: Domain label is required\n"));
          console.log(chalk.gray("Usage: dotns lookup name <label>"));
          console.log(chalk.gray("   or: dotns lookup name --name <label>"));
          console.log(chalk.gray("   or: dotns lookup --name <label>\n"));
          process.exit(1);
        }

        if (!jsonOutput) {
          banner();
        }

        const { clientWrapper, account } = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(merged),
        );

        if (!jsonOutput) {
          console.log(chalk.bold("\n▶ Domain Lookup\n"));
        }

        const result = await maybeQuiet(jsonOutput, () =>
          performDomainLookup(label, account.address, clientWrapper),
        );

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (Boolean((options as any).json)) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  lookupCommand
    .option("-n, --name <label>", "Domain label to lookup")
    .option("--json", "Output result as JSON (suppresses all other output)", false)
    .action(async (options: any, cmd: any) => {
      if (options.name) {
        try {
          const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
          const jsonOutput = getJsonFlag(merged);

          if (!jsonOutput) {
            banner();
          }

          const { clientWrapper, account } = await maybeQuiet(jsonOutput, () =>
            prepareReadOnlyContext(merged),
          );

          if (!jsonOutput) {
            console.log(chalk.bold("\n▶ Domain Lookup\n"));
          }

          const result = await maybeQuiet(jsonOutput, () =>
            performDomainLookup(merged.name as string, account.address, clientWrapper),
          );

          if (jsonOutput) {
            console.log(JSON.stringify(result));
          } else {
            console.log(chalk.green("\n✓ Complete\n"));
          }

          process.exit(0);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (Boolean((options as any).json)) {
            console.error(JSON.stringify({ error: errorMessage }));
            process.exit(1);
          }

          console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
          process.exit(1);
        }
      }
    });

  const ownerOfCommand = lookupCommand
    .command("owner-of <label>")
    .description("Show whether a name is registered and who owns it")
    .alias("oo")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(ownerOfCommand).action(async (label: string, options: any, cmd: any) => {
    try {
      const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
      const jsonOutput = getJsonFlag(merged);

      if (!jsonOutput) {
        banner();
      }

      const { clientWrapper, account } = await maybeQuiet(jsonOutput, () =>
        prepareReadOnlyContext(merged),
      );

      if (!jsonOutput) {
        console.log(chalk.bold("\n▶ Ownership Lookup\n"));
      }

      const result = await maybeQuiet(jsonOutput, () =>
        performOwnerOfLookup(label, account.address, clientWrapper),
      );

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (Boolean((options as any).json)) {
        console.error(JSON.stringify({ error: errorMessage }));
        process.exit(1);
      }

      console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
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
