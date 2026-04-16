import { Command } from "commander";
import chalk from "chalk";
import { viewDomainText, setDomainText } from "../../commands/textRecord";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { getMergedOptions } from "./jsonHelpers";
import { formatErrorMessage } from "../../utils/formatting";
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
    .description("View a domain text record");
  addAuthOptions(viewTextCommand).action(
    async (name: string, key: string, options: TextViewOptions, command: Command) => {
      const piped = !process.stdout.isTTY;
      const origWrite = process.stdout.write.bind(process.stdout);
      if (piped) {
        console.log = console.error;
        process.stdout.write = process.stderr.write.bind(
          process.stderr,
        ) as typeof process.stdout.write;
      }

      try {
        const mergedOptions = getMergedOptions(command, options);

        const context = await prepareReadOnlyContext(mergedOptions as any);

        console.error(chalk.bold("\n▶ Text View\n"));
        const spinner = ora({ stream: process.stderr });

        const value = await viewDomainText(
          context.clientWrapper!,
          context.account.address,
          name,
          key,
          spinner,
        );

        console.error(chalk.green("\n✓ Complete\n"));

        if (piped && value != null) {
          origWrite(value);
        }

        process.exit(0);
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
        process.exit(1);
      }
    },
  );

  const setTextCommand = textCommand
    .command("set <name> <key> [value]")
    .description("Set a domain text record (reads from stdin if value omitted)");

  addAuthOptions(setTextCommand).action(
    async (
      name: string,
      key: string,
      value: string | undefined,
      options: TextSetOptions,
      command: Command,
    ) => {
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

        const context = await prepareContext({ ...mergedOptions, useRevive: true });

        console.log(chalk.bold("\n▶ Text Set\n"));
        const spinner = ora();

        await setDomainText(
          context.clientWrapper!,
          context.substrateAddress,
          context.signer,
          name,
          key,
          value!,
          spinner,
        );

        console.log(chalk.green("\n✓ Complete\n"));
        process.exit(0);
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
        process.exit(1);
      }
    },
  );
}
