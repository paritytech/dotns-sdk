import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import type { KeyringPair } from "@polkadot/keyring/types";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { paseo } from "@polkadot-api/descriptors";
import { ReviveClientWrapper, type PolkadotApiClient } from "../../client/polkadotClient";
import { performDomainLookup, performOwnerOfLookup } from "../../commands/lookup";
import { verifyDomainOwnership } from "../../commands/register";
import { resolveDotnsEnvironment, resolveRpc } from "../env";
import { formatErrorMessage } from "../../utils/formatting";
import {
  resolveAuthSourceReadOnly,
  resolveAuthSource,
  createAccountFromSource,
  createSubstrateSigner,
} from "../../commands/auth";
import { addAuthOptions, getAuthOptions } from "./authOptions";
import { step, printCommandHeader } from "../ui";
import {
  getChainTokenInfo,
  prepareAssetHubContext,
  buildDotnsContext,
  buildReadOnlyDotnsContext,
} from "../context";
import { makeOnStatus } from "../txStatus";
import { resolveTransferRecipient, transferName } from "../transfer";
import { isValidTransferDestination } from "./register";
import type {
  AuthSource,
  ReadOnlyContext,
  LookupActionOptions,
  ResolvedReadOnlyAuth,
  DomainLookupResult,
} from "../../types/types";
import type { DotnsContext } from "../../core/context";
import { getJsonFlag, maybeQuiet } from "./jsonHelpers";
import { zeroAddress, checksumAddress, type Address } from "viem";

function renderDomainLookup(
  ctx: DotnsContext,
  result: DomainLookupResult,
  nativeTokenSymbol: string,
): void {
  console.log("\n▶ DotNS Domain Lookup");
  console.log(chalk.gray("  domain: ") + chalk.cyan(result.domain));
  console.log(chalk.gray("  node:   ") + chalk.white(result.node));
  console.log();

  console.log("▶ Registry (DotnsRegistry)");
  console.log(chalk.gray("  registry: ") + chalk.white(ctx.contracts.DOTNS_REGISTRY));
  console.log(chalk.gray("  exists:   ") + chalk.white(String(result.exists)));
  console.log(chalk.gray("  owner:    ") + chalk.white(result.owner));
  console.log(chalk.gray("  resolver: ") + chalk.white(result.resolver));
  console.log();

  if (!result.exists || result.owner === zeroAddress) {
    console.log("▶ Status");
    console.log(chalk.gray("  status: ") + chalk.yellow("not registered (no record)"));
    console.log();
    if (result.baseNameReservation) renderBaseNameReservation(ctx, result.baseNameReservation);
    return;
  }

  console.log("▶ Label Store (StoreFactory)");
  console.log(chalk.gray("  factory: ") + chalk.white(ctx.contracts.STORE_FACTORY));
  console.log(chalk.gray("  store:   ") + chalk.white(result.store ?? zeroAddress));
  console.log(
    chalk.gray("  status:  ") + chalk.white(result.store ? "store exists" : "no store deployed"),
  );
  console.log();

  console.log("▶ Forward Resolution (DotnsResolver)");
  console.log(chalk.gray("  expectedResolver: ") + chalk.white(ctx.contracts.DOTNS_RESOLVER));
  if (checksumAddress(result.resolver) !== checksumAddress(ctx.contracts.DOTNS_RESOLVER)) {
    console.log(
      chalk.gray("  note: ") +
        chalk.yellow("registry resolver is not DotnsResolver, skipping address lookup"),
    );
  } else {
    console.log(
      chalk.gray("  resolvedAddress: ") + chalk.white(result.resolvedAddress ?? "(not set)"),
    );
  }
  console.log();

  console.log("▶ Owner Balance");
  if (result.ownerBalance) {
    console.log(chalk.gray("  substrate: ") + chalk.white(result.ownerBalance.substrate));
    console.log(
      chalk.gray("  free:      ") + chalk.white(`${result.ownerBalance.free} ${nativeTokenSymbol}`),
    );
  } else {
    console.log(chalk.gray("  balance: ") + chalk.yellow("unavailable"));
  }
  console.log();

  console.log("▶ Proof of Personhood (DotnsPopResolver)");
  console.log(chalk.gray("  chatKey: ") + chalk.white(result.chatKey ?? "(not set)"));
  console.log();

  if (result.baseNameReservation) renderBaseNameReservation(ctx, result.baseNameReservation);

  console.log("▶ Lookup completed");
}

function renderBaseNameReservation(
  ctx: DotnsContext,
  reservation: NonNullable<DomainLookupResult["baseNameReservation"]>,
): void {
  console.log("▶ Base Name Reservation (PopRules)");
  console.log(chalk.gray("  oracle:   ") + chalk.white(ctx.contracts.DOTNS_RULES));
  console.log(chalk.gray("  baseName: ") + chalk.cyan(reservation.baseName));
  console.log(chalk.gray("  isReserved: ") + chalk.white(String(reservation.isReserved)));
  console.log(chalk.gray("  owner:      ") + chalk.white(reservation.reservedBy));
  if (reservation.expires) {
    console.log(chalk.gray("  expires:    ") + chalk.white(reservation.expires));
  }
  console.log();
}

async function createReadOnlyChainContext(rpc: string) {
  const rawClient = createClient(getWsProvider(rpc));
  const client = rawClient.getTypedApi(paseo);
  const tokenInfo = await getChainTokenInfo(rawClient);
  return {
    clientWrapper: new ReviveClientWrapper(client as PolkadotApiClient),
    ...tokenInfo,
  };
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
  const environment = resolveDotnsEnvironment(options.env ?? options.network);
  const rpc = resolveRpc(options.rpc, environment.id);

  const readOnlyContext = await step(`Connecting RPC ${rpc}`, async () =>
    createReadOnlyChainContext(rpc),
  );
  const { clientWrapper, nativeTokenDecimals, nativeTokenSymbol } = readOnlyContext;

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

  await ensureAccountMappedWhenAuthenticated(clientWrapper, keypair, auth.resolvedFrom);

  const evmAddress = await step("Resolving EVM address", async () =>
    clientWrapper.resolveOwnEvmAddress(keypair.address),
  );

  console.log(chalk.gray("\n  RPC:     ") + chalk.white(rpc));
  console.log(chalk.gray("  Env:     ") + chalk.white(environment.label));
  console.log(
    chalk.gray("  Token:   ") +
      chalk.white(`${nativeTokenSymbol} (${nativeTokenDecimals} decimals)`),
  );
  console.log(chalk.gray("  Account: ") + chalk.white(keypair.address));

  return {
    clientWrapper,
    account: { address: keypair.address },
    rpc,
    environment: environment.id,
    nativeTokenDecimals,
    nativeTokenSymbol,
    evmAddress,
  };
}

async function ensureAccountMappedWhenAuthenticated(
  clientWrapper: ReviveClientWrapper,
  keypair: KeyringPair,
  resolvedFrom: ResolvedReadOnlyAuth["resolvedFrom"],
): Promise<void> {
  if (resolvedFrom === "default") return;
  const signer = createSubstrateSigner(keypair);
  try {
    await step("Ensuring account mapped", async () =>
      clientWrapper.ensureAccountMapped(keypair.address, signer),
    );
  } catch (mapError) {
    console.log(
      chalk.yellow(
        `  ⚠ Account mapping skipped: ${mapError instanceof Error ? mapError.message : String(mapError)}`,
      ),
    );
  }
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
        const jsonOutput = getJsonFlag(cmd);

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

        const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(merged));

        if (!jsonOutput) printCommandHeader("Domain Lookup");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "registry"),
        });

        const result = await maybeQuiet(jsonOutput, () => performDomainLookup(ctx, label));

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        } else {
          renderDomainLookup(ctx, result, context.nativeTokenSymbol);
          console.log(chalk.green("\n✓ Complete\n"));
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(cmd);

        if (jsonOutput) {
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
      const subcommand = cmd.args?.[0];
      if (["name", "owner-of", "oo", "transfer"].includes(subcommand)) return;

      if (options.name) {
        try {
          const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
          const jsonOutput = getJsonFlag(cmd);

          const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(merged));

          if (!jsonOutput) printCommandHeader("Domain Lookup");
          const spinner = ora();
          const ctx = buildReadOnlyDotnsContext(context, {
            onStatus: makeOnStatus(spinner, "registry"),
          });

          const result = await maybeQuiet(jsonOutput, () =>
            performDomainLookup(ctx, merged.name as string),
          );

          if (jsonOutput) {
            console.log(JSON.stringify(result));
          } else {
            renderDomainLookup(ctx, result, context.nativeTokenSymbol);
            console.log(chalk.green("\n✓ Complete\n"));
          }

          process.exit(0);
        } catch (error) {
          const errorMessage = formatErrorMessage(error);
          const jsonOutput = getJsonFlag(cmd);

          if (jsonOutput) {
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
      const jsonOutput = getJsonFlag(cmd);

      const context = await maybeQuiet(jsonOutput, () => prepareReadOnlyContext(merged));

      if (!jsonOutput) printCommandHeader("Ownership lookup");
      const spinner = ora();
      const ctx = buildReadOnlyDotnsContext(context, {
        onStatus: makeOnStatus(spinner, "registrar"),
      });

      const result = await maybeQuiet(jsonOutput, () => performOwnerOfLookup(ctx, label));

      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.gray("  Label:             ") + chalk.cyan(result.label ?? label));
        console.log(
          chalk.gray("  Domain:            ") + chalk.cyan(result.domain ?? `${label}.dot`),
        );
        console.log(chalk.gray("  Registered:        ") + chalk.white(String(result.registered)));
        console.log(
          chalk.gray("  Owner (EVM):       ") +
            chalk.white(result.registered ? result.ownerEvm : "(none)"),
        );
        console.log(chalk.gray("  Owner (Substrate): ") + chalk.white(result.ownerSubstrate));
        console.log(chalk.green("\n✓ Complete\n"));
      }

      process.exit(0);
    } catch (error) {
      const errorMessage = formatErrorMessage(error);
      const jsonOutput = getJsonFlag(cmd);

      if (jsonOutput) {
        console.error(JSON.stringify({ error: errorMessage }));
        process.exit(1);
      }

      console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
      process.exit(1);
    }
  });

  const transferCommand = lookupCommand
    .command("transfer [label]")
    .description("Transfer domain ownership to another address or label")
    .requiredOption(
      "-d, --destination <destination>",
      "Transfer destination (EVM address, SS58 address, or domain label)",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(transferCommand).action(
    async (positionalLabel: string | undefined, options: any, cmd: any) => {
      try {
        const merged = { ...(options ?? {}), ...getAuthOptions(cmd) } as LookupActionOptions;
        const jsonOutput = getJsonFlag(cmd);
        const label = positionalLabel || merged.name || cmd.parent?.opts()?.name;

        if (!label) {
          throw new Error(
            "Domain label is required: dotns lookup transfer <label> -d <destination>",
          );
        }

        const destination = (merged as any).destination as string;

        if (!isValidTransferDestination(destination)) {
          throw new Error(
            "Invalid transfer destination: must be a valid EVM address, Substrate address, or domain label",
          );
        }

        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(merged));
        const ctx = buildDotnsContext(context);

        if (!jsonOutput) {
          printCommandHeader("Transfer");
          console.log(chalk.gray("  domain: ") + chalk.cyan(`${label}.dot`));
          console.log(chalk.gray("  to:     ") + chalk.white(destination));
        }

        const recipient = await maybeQuiet(jsonOutput, () =>
          step("Resolving recipient", async () => resolveTransferRecipient(ctx, destination)),
        );

        await maybeQuiet(jsonOutput, () =>
          step("Transferring domain", async () => transferName(ctx, label, recipient as Address)),
        );

        await maybeQuiet(jsonOutput, () =>
          step("Verifying ownership", async () =>
            verifyDomainOwnership(ctx, label, recipient as Address),
          ),
        );

        if (jsonOutput) {
          console.log(
            JSON.stringify({
              label,
              domain: `${label}.dot`,
              destination,
              recipient,
              transferred: true,
            }),
          );
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(cmd);

        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );
}
