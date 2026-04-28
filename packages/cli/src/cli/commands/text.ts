import { Command } from "commander";
import chalk from "chalk";
import { viewDomainText, setDomainText } from "../../commands/textRecord";
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
import ora from "ora";

export interface TextViewOptions {
  rpc?: string;
}

export interface TextSetOptions {
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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Text View\n"));
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          viewDomainText(context.clientWrapper!, context.account.address, name, key, spinner),
        );

        if (!emitJsonResult(jsonOutput, result)) {
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

        if (!jsonOutput) console.log(chalk.bold("\n▶ Text Set\n"));
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          setDomainText(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            key,
            value!,
            spinner,
          ),
        );

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
