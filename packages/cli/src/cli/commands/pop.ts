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
import { ProofOfPersonhoodStatus } from "../../types/types";
import { prepareReadOnlyContext } from "./lookup";
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
    .description("Set ProofOfPersonhood status (none, lite, or full)");

  addAuthOptions(setPopCommand).action(
    async (status: string, options: CommandOptions, command: Command) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await prepareContext(mergedOptions);

        const parsedStatus = parseProofOfPersonhoodStatus(status);

        await setUserProofOfPersonhoodStatus(
          context.clientWrapper!,
          context.substrateAddress,
          context.signer,
          context.evmAddress!,
          "",
          parsedStatus,
        );

        console.log(chalk.green("\n✓ PoP Status Updated\n"));
        process.exit(0);
      } catch (error) {
        console.error(
          chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
        );
        process.exit(1);
      }
    },
  );

  const infoCommand = popCommand.command("info").description("Display ProofOfPersonhood status");

  addAuthOptions(infoCommand).action(async (options: CommandOptions, command: Command) => {
    try {
      const mergedOptions = getMergedOptions(command, options);
      const info = await readPopInfo(mergedOptions);

      console.log(chalk.bold("\n📋 ProofOfPersonhood Status\n"));
      console.log(chalk.gray("  substrate: ") + chalk.white(info.substrate));
      console.log(chalk.gray("  evm:       ") + chalk.white(info.evm));
      console.log(chalk.gray("  status:    ") + chalk.white(ProofOfPersonhoodStatus[info.status]));
      console.log(chalk.green("\n✓ PoP Status Retrieved\n"));

      process.exit(0);
    } catch (error) {
      console.error(
        chalk.red(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}\n`),
      );
      process.exit(1);
    }
  });
}
