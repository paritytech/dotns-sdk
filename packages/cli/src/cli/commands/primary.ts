import { printCommandHeader } from "../ui";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { type Address } from "viem";
import { setPrimaryName, getPrimaryName } from "../../commands/reverseRecord";
import { ownEvmAddress } from "../../core/context";
import { resolveTransferRecipient } from "../transfer";
import { addAuthOptions } from "./authOptions";
import { prepareContext, buildDotnsContext, buildReadOnlyDotnsContext } from "../context";
import { makeOnStatus } from "../txStatus";
import { prepareReadOnlyContext } from "./lookup";
import type { AssetHubContext } from "../../types/types";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";

interface PrimaryCommonOptions {
  rpc?: string;
}

export function attachPrimaryCommands(root: Command) {
  const primaryCommand = root
    .command("primary")
    .description("Manage the primary (reverse) name shown for your account");
  addAuthOptions(primaryCommand);

  const setCommand = primaryCommand
    .command("set <name>")
    .description("Set one of your names as the primary name for your account")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(setCommand).action(
    async (name: string, options: PrimaryCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Set primary name");
        const spinner = ora();
        const ctx = buildDotnsContext(context as AssetHubContext, {
          onStatus: makeOnStatus(spinner, "primary name"),
        });

        const result = await maybeQuiet(jsonOutput, () => setPrimaryName(ctx, name));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  name: ") + chalk.cyan(result.name));
          console.log(chalk.gray("  tx:   ") + chalk.blue(result.txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const statusCommand = primaryCommand
    .command("status [address]")
    .description("Show the primary name for an account (defaults to your own)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(statusCommand).action(
    async (address: string | undefined, options: PrimaryCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as never),
        );

        if (!jsonOutput) printCommandHeader("Primary name");
        const spinner = ora();
        const ctx = buildReadOnlyDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "primary name"),
        });

        const targetEvm = address
          ? ((await maybeQuiet(jsonOutput, () =>
              resolveTransferRecipient(ctx, address),
            )) as Address)
          : await ownEvmAddress(ctx);

        const name = await maybeQuiet(jsonOutput, () => getPrimaryName(ctx, targetEvm));

        if (!emitJsonResult(jsonOutput, { address: targetEvm, name })) {
          console.log(chalk.gray("  address: ") + chalk.white(targetEvm));
          if (name === null) {
            console.log(chalk.gray("  no primary name set"));
          } else {
            console.log(chalk.gray("  primary: ") + chalk.cyan(name));
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
