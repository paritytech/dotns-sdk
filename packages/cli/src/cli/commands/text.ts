import { Command } from "commander";
import chalk from "chalk";
import type { CommandOptions } from "../../types/types";
import { viewDomainText, setDomainText } from "../../commands/textRecord";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import ora from "ora";

export interface TextViewOptions {
  rpc?: string;
}

export interface TextSetOptions {
  rpc?: string;
}

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

export function attachTextCommands(root: Command) {
  const textCommand = root.command("text").description("Manage domain text records");

  addAuthOptions(textCommand);

  const viewTextCommand = textCommand
    .command("view <name> <key>")
    .description("View a domain text record");
  addAuthOptions(viewTextCommand).action(
    async (name: string, key: string, options: TextViewOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const context = await prepareReadOnlyContext(mergedOptions as any);

        console.log(chalk.bold("\n▶ Text View\n"));
        const spinner = ora();

        await viewDomainText(context.clientWrapper!, context.account.address, name, key, spinner);

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

  const setTextCommand = textCommand
    .command("set <name> <key> <value>")
    .description("Set a domain text record");

  addAuthOptions(setTextCommand).action(
    async (name: string, key: string, value: string, options: TextSetOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const context = await prepareContext({ ...mergedOptions, useRevive: true });

        console.log(chalk.bold("\n▶ Text Set\n"));
        const spinner = ora();

        await setDomainText(
          context.clientWrapper!,
          context.substrateAddress,
          context.signer,
          name,
          key,
          value,
          spinner,
        );

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
}
