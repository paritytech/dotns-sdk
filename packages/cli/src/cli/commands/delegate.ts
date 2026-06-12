import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { type Address } from "viem";
import {
  setNameDelegate,
  revokeNameDelegate,
  getNameDelegate,
  setRecordDelegate,
  getRecordDelegate,
} from "../../commands/delegate";
import { resolveTransferRecipient } from "../transfer";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";

interface DelegateCommonOptions {
  rpc?: string;
}

interface DelegateRecordsOptions extends DelegateCommonOptions {
  revoke?: boolean;
}

export function attachDelegateCommands(root: Command) {
  const delegateCommand = root
    .command("delegate")
    .description("Let another account manage and transfer one of your names");
  addAuthOptions(delegateCommand);

  const setCommand = delegateCommand
    .command("set <name> <delegate>")
    .description("Delegate full control of a name; delegate may be an EVM, SS58, or .dot label")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(setCommand).action(
    async (name: string, delegate: string, options: DelegateCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Delegate name\n"));
        const spinner = ora();

        const delegateAddress = await maybeQuiet(jsonOutput, () =>
          resolveTransferRecipient(context.clientWrapper!, context.substrateAddress, delegate),
        );

        if (!jsonOutput) {
          console.log(chalk.gray("  name:     ") + chalk.cyan(name));
          console.log(chalk.gray("  delegate: ") + chalk.white(delegateAddress));
        }

        const result = await maybeQuiet(jsonOutput, () =>
          setNameDelegate(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            delegateAddress as Address,
            spinner,
          ),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  tx:       ") + chalk.blue(result.txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const revokeCommand = delegateCommand
    .command("revoke <name>")
    .description("Revoke any delegate currently set on a name")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(revokeCommand).action(
    async (name: string, options: DelegateCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Revoke delegate\n"));
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          revokeNameDelegate(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            spinner,
          ),
        );

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

  const statusCommand = delegateCommand
    .command("status <name>")
    .description("Show the current delegate for a name")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(statusCommand).action(
    async (name: string, options: DelegateCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as never),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Delegate status\n"));
        const spinner = ora();

        const delegate = await maybeQuiet(jsonOutput, () =>
          getNameDelegate(context.clientWrapper!, context.account.address, name, spinner),
        );

        if (!emitJsonResult(jsonOutput, { name, delegate })) {
          if (delegate === null) {
            console.log(chalk.gray("  no delegate set"));
          } else {
            console.log(chalk.gray("  delegate: ") + chalk.white(delegate));
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const recordsCommand = delegateCommand
    .command("records <operator>")
    .description(
      "Let another account edit records on all your names; operator may be EVM, SS58, or .dot",
    )
    .option("--revoke", "Revoke record-editing access instead of granting it", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(recordsCommand).action(
    async (operator: string, options: DelegateRecordsOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        const approved = !options.revoke;
        if (!jsonOutput) {
          console.log(
            chalk.bold(approved ? "\n▶ Delegate records\n" : "\n▶ Revoke record delegate\n"),
          );
        }
        const spinner = ora();

        const operatorAddress = await maybeQuiet(jsonOutput, () =>
          resolveTransferRecipient(context.clientWrapper!, context.substrateAddress, operator),
        );

        if (!jsonOutput) {
          console.log(chalk.gray("  operator: ") + chalk.white(operatorAddress));
        }

        const result = await maybeQuiet(jsonOutput, () =>
          setRecordDelegate(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            operatorAddress as Address,
            approved,
            spinner,
          ),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  tx:       ") + chalk.blue(result.txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const recordsStatusCommand = delegateCommand
    .command("records-status <operator>")
    .description("Show whether an operator may edit records on all your names")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(recordsStatusCommand).action(
    async (operator: string, options: DelegateCommonOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as never),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Record delegate status\n"));
        const spinner = ora();

        const operatorAddress = await maybeQuiet(jsonOutput, () =>
          resolveTransferRecipient(context.clientWrapper!, context.account.address, operator),
        );

        const approved = await maybeQuiet(jsonOutput, () =>
          getRecordDelegate(
            context.clientWrapper!,
            context.account.address,
            operatorAddress as Address,
            spinner,
          ),
        );

        if (!emitJsonResult(jsonOutput, { operator: operatorAddress, approved })) {
          console.log(chalk.gray("  operator: ") + chalk.white(operatorAddress));
          console.log(
            chalk.gray("  approved: ") + (approved ? chalk.green("yes") : chalk.gray("no")),
          );
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
