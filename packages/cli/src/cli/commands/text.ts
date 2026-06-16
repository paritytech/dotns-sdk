import { printCommandHeader } from "../ui";
import { Command } from "commander";
import chalk from "chalk";
import { getTextRecord, setTextRecord } from "../../commands/textRecord";
import { addAuthOptions } from "./authOptions";
import { buildDotnsContext, prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { makeOnStatus } from "../txStatus";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import ora from "ora";

interface TextViewOptions {
  rpc?: string;
}

interface TextSetOptions {
  rpc?: string;
}

export function attachTextCommands(root: Command) {
  const textCommand = root.command("text").description("Manage domain text records");

  addAuthOptions(textCommand);

  const viewTextCommand = textCommand
    .command("view <name> <key>")
    .description("View a domain text record")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(viewTextCommand).action(
    async (name: string, key: string, options: TextViewOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);

        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as any),
        );

        if (!jsonOutput) printCommandHeader("Text View");
        const spinner = ora();
        const ctx = buildDotnsContext(
          { ...context, substrateAddress: context.account.address, signer: undefined } as any,
          { onStatus: makeOnStatus(spinner, "text record") },
        );

        const result = await maybeQuiet(jsonOutput, () => getTextRecord(ctx, name, key));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  domain: ") + chalk.cyan(result.domain));
          console.log(chalk.gray("  key:    ") + chalk.white(result.key));
          if (!result.exists) {
            console.log(chalk.yellow("  status: Domain not registered"));
          } else {
            console.log(
              chalk.gray("  value:  ") +
                (result.value ? chalk.cyan(result.value) : chalk.yellow("(not set)")),
            );
          }
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const setTextCommand = textCommand
    .command("set <name> <key> [value]")
    .description("Set a domain text record (reads from stdin if value omitted)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(setTextCommand).action(
    async (
      name: string,
      key: string,
      value: string | undefined,
      options: TextSetOptions,
      command: Command,
    ) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);

        if (!value) {
          if (process.stdin.isTTY) {
            throw new Error("No value provided. Pass a value argument or pipe via stdin.");
          }
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }
          value = Buffer.concat(chunks).toString("utf-8").trimEnd();
        }

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) printCommandHeader("Text Set");
        const spinner = ora();
        const ctx = buildDotnsContext(context as any, {
          onStatus: makeOnStatus(spinner, "text record"),
        });

        const result = await maybeQuiet(jsonOutput, () => setTextRecord(ctx, name, key, value!));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  domain: ") + chalk.cyan(result.domain));
          console.log(chalk.gray("  key:    ") + chalk.white(result.key));
          console.log(chalk.gray("  value:  ") + chalk.cyan(result.value));
          console.log(chalk.gray("  tx:     ") + chalk.blue(result.txHash));
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
