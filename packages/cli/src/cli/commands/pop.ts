import { Command } from "commander";
import chalk from "chalk";
import { getUserProofOfPersonhoodStatus } from "../../commands/register";
import { addAuthOptions } from "./authOptions";
import type { CommandOptions } from "../../types/types";
import { ProofOfPersonhoodStatus } from "../../types/types";
import { prepareReadOnlyContext } from "./lookup";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import type { Address } from "viem";

export type PopInfoResult = {
  substrate: string;
  evm: string;
  status: ProofOfPersonhoodStatus;
};

function formatPopStatus(status: ProofOfPersonhoodStatus): "none" | "lite" | "full" | "reserved" {
  switch (status) {
    case ProofOfPersonhoodStatus.ProofOfPersonhoodLite:
      return "lite";
    case ProofOfPersonhoodStatus.ProofOfPersonhoodFull:
      return "full";
    case ProofOfPersonhoodStatus.Reserved:
      return "reserved";
    case ProofOfPersonhoodStatus.NoStatus:
    default:
      return "none";
  }
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
  const popCommand = root.command("pop").description("ProofOfPersonhood status lookup");

  addAuthOptions(popCommand);

  const infoCommand = popCommand
    .command("info")
    .alias("status")
    .description("Display ProofOfPersonhood status from the personhood precompile")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(infoCommand).action(async (options: CommandOptions, command: Command) => {
    const jsonOutput = getJsonFlag(command);
    try {
      const mergedOptions = getMergedOptions(command, options);
      const info = await maybeQuiet(jsonOutput, () => readPopInfo(mergedOptions));

      if (
        !emitJsonResult(jsonOutput, {
          substrate: info.substrate,
          evm: info.evm,
          status: formatPopStatus(info.status),
          statusCode: info.status,
        })
      ) {
        console.log(chalk.bold("\n📋 ProofOfPersonhood Status\n"));
        console.log(chalk.gray("  substrate: ") + chalk.white(info.substrate));
        console.log(chalk.gray("  evm:       ") + chalk.white(info.evm));
        console.log(chalk.gray("  status:    ") + chalk.white(formatPopStatus(info.status)));
        console.log(chalk.green("\n✓ PoP Status Retrieved\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });
}
