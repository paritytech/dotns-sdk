import { Command } from "commander";
import chalk from "chalk";
import {
  getUserProofOfPersonhoodStatus,
  setUserProofOfPersonhoodStatus,
} from "../../commands/register";
import { parseProofOfPersonhoodStatus } from "../labels";
import { prepareContext } from "../context";
import { addAuthOptions } from "./authOptions";
import type { CommandOptions } from "../../types/types";
import { formatErrorMessage } from "../../utils/formatting";
import { ProofOfPersonhoodStatus } from "../../types/types";
import { prepareReadOnlyContext, getJsonFlag } from "./lookup";
import { maybeQuiet } from "./bulletin";
import type { Address } from "viem";

export type PopInfoResult = {
  substrate: string;
  evm: string;
  status: ProofOfPersonhoodStatus;
};

function getMergedOptions(command: Command | undefined, fallback: CommandOptions): CommandOptions {
  const mergedOptions: CommandOptions = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts() as CommandOptions;
      for (const key in parentOptions) {
        const optionKey = key as keyof CommandOptions;
        if (!(optionKey in mergedOptions) && parentOptions[optionKey] !== undefined) {
          mergedOptions[optionKey] = parentOptions[optionKey];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}

async function readPopInfo(options: CommandOptions): Promise<PopInfoResult> {
  const context = await prepareReadOnlyContext(options as any);
  const status = await getUserProofOfPersonhoodStatus(
    context.clientWrapper!,
    context.account.address,
    context.evmAddress as Address,
  );

  return {
    substrate: context.account.address,
    evm: context.evmAddress!,
    status,
  };
}

export function attachPopCommands(root: Command): void {
  const popCommand = root.command("pop").description("ProofOfPersonhood status management");

  addAuthOptions(popCommand);

  const setPopCommand = popCommand
    .command("set <status>")
    .description("Set ProofOfPersonhood status (none, lite, or full)")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(setPopCommand).action(
    async (status: string, options: CommandOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareContext(mergedOptions));

        const parsedStatus = parseProofOfPersonhoodStatus(status);

        await maybeQuiet(jsonOutput, () =>
          setUserProofOfPersonhoodStatus(
            context.clientWrapper!,
            context.substrateAddress,
            context.signer,
            context.evmAddress!,
            "",
            parsedStatus,
          ),
        );

        if (jsonOutput) {
          console.log(
            JSON.stringify({
              ok: true,
              status: ProofOfPersonhoodStatus[parsedStatus].toLowerCase(),
              statusCode: parsedStatus,
            }),
          );
        } else {
          console.log(chalk.green("\n✓ PoP Status Updated\n"));
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

  const infoCommand = popCommand
    .command("info")
    .description("Display ProofOfPersonhood status")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(infoCommand).action(async (options: CommandOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const info = await maybeQuiet(jsonOutput, () => readPopInfo(mergedOptions));

      if (jsonOutput) {
        console.log(
          JSON.stringify({
            substrate: info.substrate,
            evm: info.evm,
            status: ProofOfPersonhoodStatus[info.status].toLowerCase(),
            statusCode: info.status,
          }),
        );
      } else {
        console.log(chalk.bold("\n📋 ProofOfPersonhood Status\n"));
        console.log(chalk.gray("  substrate: ") + chalk.white(info.substrate));
        console.log(chalk.gray("  evm:       ") + chalk.white(info.evm));
        console.log(
          chalk.gray("  status:    ") + chalk.white(ProofOfPersonhoodStatus[info.status]),
        );
        console.log(chalk.green("\n✓ PoP Status Retrieved\n"));
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
  });
}
