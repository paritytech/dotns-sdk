import { Command } from "commander";
import chalk from "chalk";
import type { CommandOptions } from "../../types/types";
import { viewDomainContentHash, setDomainContentHash } from "../../commands/contentHash";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext, getJsonFlag } from "./lookup";
import { maybeQuiet } from "./bulletin";
import { formatErrorMessage } from "../../utils/formatting";
import ora from "ora";

export interface ContentViewOptions {
  rpc?: string;
}

export interface ContentSetOptions {
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

export function attachContentCommands(root: Command) {
  const contentCommand = root.command("content").description("Manage domain content hashes");

  addAuthOptions(contentCommand);

  const viewContentCommand = contentCommand
    .command("view <name>")
    .description("View domain content hash")
    .option("--json", "Output result as JSON (suppresses all other output)", false);
  addAuthOptions(viewContentCommand).action(
    async (name: string, options: ContentViewOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);

        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as any),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Content View\n"));
        // Ora caches process.stderr (the object), not .write (the method).
        // withCapturedConsole replaces .write on the object, so spinner
        // output is captured as long as start/succeed/fail run inside maybeQuiet.
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          viewDomainContentHash(context.clientWrapper!, context.account.address, name, spinner),
        );

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }
        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  const setContentCommand = contentCommand
    .command("set <name> <cid>")
    .description("Set domain content hash (IPFS CID)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(setContentCommand).action(
    async (name: string, cid: string, options: ContentSetOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useRevive: true }),
        );

        if (!jsonOutput) console.log(chalk.bold("\n▶ Content Set\n"));
        // See view handler above for why ora is safe inside maybeQuiet.
        const spinner = ora();

        const result = await maybeQuiet(jsonOutput, () =>
          setDomainContentHash(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            name,
            cid,
            spinner,
          ),
        );

        if (jsonOutput) {
          console.log(JSON.stringify(result));
        } else {
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
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
