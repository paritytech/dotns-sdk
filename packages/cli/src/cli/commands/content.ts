import { Command } from "commander";
import chalk from "chalk";
import type { CommandOptions } from "../../types/types";
import { viewDomainContentHash, setDomainContentHash } from "../../commands/contentHash";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
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
    .description("View domain content hash");
  addAuthOptions(viewContentCommand).action(
    async (name: string, options: ContentViewOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        const context = await prepareReadOnlyContext(mergedOptions as any);

        console.log(chalk.bold("\n▶ Content View\n"));
        const spinner = ora();

        await viewDomainContentHash(context.clientWrapper!, context.account.address, name, spinner);

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

  const setContentCommand = contentCommand
    .command("set <name> <cid>")
    .description("Set domain content hash (IPFS CID)");

  addAuthOptions(setContentCommand).action(
    async (name: string, cid: string, options: ContentSetOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        const context = await prepareContext({ ...mergedOptions, useRevive: true });

        console.log(chalk.bold("\n▶ Content Set\n"));
        const spinner = ora();

        await setDomainContentHash(
          context.clientWrapper!,
          context.substrateAddress,
          context.signer,
          name,
          cid,
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
