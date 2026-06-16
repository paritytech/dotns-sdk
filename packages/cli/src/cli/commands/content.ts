import { printCommandHeader } from "../ui";
import { Command } from "commander";
import chalk from "chalk";
import { getContentHash, setContentHash } from "../../commands/contentHash";
import { addAuthOptions } from "./authOptions";
import { buildDotnsContext, prepareContext } from "../context";
import { prepareReadOnlyContext } from "./lookup";
import { makeOnStatus } from "../txStatus";
import { dotliViewUrls } from "../../utils/constants";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import ora from "ora";

interface ContentViewOptions {
  rpc?: string;
}

interface ContentSetOptions {
  rpc?: string;
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

        if (!jsonOutput) printCommandHeader("Content View");
        const spinner = ora();
        const ctx = buildDotnsContext(
          { ...context, substrateAddress: context.account.address, signer: undefined } as any,
          { onStatus: makeOnStatus(spinner, "content hash") },
        );

        const result = await maybeQuiet(jsonOutput, () => getContentHash(ctx, name));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  domain:      ") + chalk.cyan(result.domain));
          console.log(
            chalk.gray("  contenthash: ") +
              (result.contenthash ? chalk.white(result.contenthash) : chalk.yellow("(not set)")),
          );
          console.log(
            chalk.gray("  cid:         ") +
              (result.cid ? chalk.cyan(result.cid) : chalk.yellow("(not set)")),
          );
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
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

        if (!jsonOutput) printCommandHeader("Content Set");
        const spinner = ora();
        const ctx = buildDotnsContext(context as any, {
          onStatus: makeOnStatus(spinner, "content hash"),
        });

        const result = await maybeQuiet(jsonOutput, () => setContentHash(ctx, name, cid));

        if (!emitJsonResult(jsonOutput, result)) {
          console.log(chalk.gray("  domain: ") + chalk.cyan(result.domain));
          console.log(chalk.gray("  cid:    ") + chalk.cyan(result.cid));
          console.log(chalk.gray("  tx:     ") + chalk.blue(result.txHash));
          console.log(chalk.green("\n✓ Complete\n"));
          console.log(chalk.gray("  View on dot.li:"));
          for (const url of dotliViewUrls(name)) {
            console.log("    " + chalk.cyan(url));
          }
          console.log();
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
