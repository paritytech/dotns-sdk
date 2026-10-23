import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getUserProofOfPersonhoodStatus, getPendingClaimLabels } from "../../commands/register";
import {
  describeClearing,
  expireReservation,
  getReservationQueue,
  type ReservationQueueState,
} from "../../commands/reservationQueue";
import { addAuthOptions } from "./authOptions";
import type { CommandOptions } from "../../types/types";
import { ProofOfPersonhoodStatus } from "../../types/types";
import { buildDotnsContext, buildReadOnlyDotnsContext, prepareAssetHubContext } from "../context";
import { makeOnStatus } from "../txStatus";
import { printCommandHeader } from "../ui";
import { prepareReadOnlyContext } from "./lookup";
import {
  getMergedOptions,
  getJsonFlag,
  maybeQuiet,
  emitJsonResult,
  handleCommandError,
} from "./jsonHelpers";
import type { Address } from "viem";

type PopInfoResult = {
  substrate: string;
  evm: string;
  status: ProofOfPersonhoodStatus;
  pendingClaims: string[];
};

function formatPopStatus(
  status: ProofOfPersonhoodStatus,
): "none" | "devicehood" | "personhood" | "reserved" {
  switch (status) {
    case ProofOfPersonhoodStatus.Devicehood:
      return "devicehood";
    case ProofOfPersonhoodStatus.Personhood:
      return "personhood";
    case ProofOfPersonhoodStatus.Reserved:
      return "reserved";
    case ProofOfPersonhoodStatus.NoStatus:
    default:
      return "none";
  }
}

async function readPopInfo(options: CommandOptions): Promise<PopInfoResult> {
  const context = await prepareReadOnlyContext(options as any, { reportsOnCaller: true });
  const ctx = buildReadOnlyDotnsContext(context);
  const evm = context.evmAddress as Address;
  const [status, pendingClaims] = await Promise.all([
    getUserProofOfPersonhoodStatus(ctx, evm),
    getPendingClaimLabels(ctx, evm),
  ]);

  return {
    substrate: context.account.address,
    evm: context.evmAddress!,
    status,
    pendingClaims,
  };
}

function queueJson(queue: ReservationQueueState) {
  return {
    label: queue.label,
    entries: queue.entries.toString(),
    frontActive: queue.frontActive,
    nextHolder: queue.nextHolder,
    blocked: queue.blocked,
    clearable: queue.clearable,
    releasable: queue.releasable,
  };
}

function printQueue(queue: ReservationQueueState): void {
  console.log(chalk.gray("  name:      ") + chalk.cyan(queue.label));
  console.log(chalk.gray("  entries:   ") + chalk.white(queue.entries.toString()));
  console.log(
    chalk.gray("  front:     ") +
      (queue.frontActive
        ? chalk.white(`active, held by ${queue.nextHolder}`)
        : queue.entries > 0n
          ? chalk.yellow("expired or emptied")
          : chalk.white("none")),
  );
  if (queue.clearable && queue.nextHolder !== null) {
    console.log(chalk.gray("  next:      ") + chalk.white(`active, held by ${queue.nextHolder}`));
  }
  console.log(
    chalk.gray("  public:    ") +
      (queue.blocked ? chalk.yellow("blocked by a reservation") : chalk.white("open")),
  );
}

export function attachPopCommands(root: Command): void {
  const popCommand = root
    .command("pop")
    .description("ProofOfPersonhood status and personhood-name reservation queues");

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
          pendingClaims: info.pendingClaims,
        })
      ) {
        console.log(chalk.bold("\n📋 ProofOfPersonhood Status\n"));
        console.log(chalk.gray("  substrate:  ") + chalk.white(info.substrate));
        console.log(chalk.gray("  evm:        ") + chalk.white(info.evm));
        console.log(chalk.gray("  status:     ") + chalk.white(formatPopStatus(info.status)));
        if (info.pendingClaims.length > 0) {
          console.log(
            chalk.gray("  pending:    ") +
              chalk.yellow(`${info.pendingClaims.join(", ")} (run "dotns store sync" to settle)`),
          );
        }
        console.log(chalk.green("\n✓ Personhood Status Retrieved\n"));
      }

      process.exit(0);
    } catch (error) {
      handleCommandError(jsonOutput, error);
    }
  });

  const queueCommand = popCommand
    .command("queue <name>")
    .description("Show the reservation queue of a personhood name")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(queueCommand).action(
    async (name: string, options: CommandOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () =>
          prepareReadOnlyContext(mergedOptions as never),
        );
        const ctx = buildReadOnlyDotnsContext(context);
        const queue = await maybeQuiet(jsonOutput, () => getReservationQueue(ctx, name));

        if (!emitJsonResult(jsonOutput, queueJson(queue))) {
          printCommandHeader("Reservation queue");
          printQueue(queue);
          const clearing = describeClearing(queue);
          if (clearing !== null) console.log(chalk.yellow(`\n  ${clearing}`));
          console.log();
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );

  const expireCommand = popCommand
    .command("expire <name>")
    .description(
      "Clear expired and emptied reservations from the front of a personhood name's queue",
    )
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(expireCommand).action(
    async (name: string, options: CommandOptions, command: Command) => {
      const jsonOutput = getJsonFlag(command);
      try {
        const mergedOptions = getMergedOptions(command, options);
        const context = await maybeQuiet(jsonOutput, () => prepareAssetHubContext(mergedOptions));

        if (!jsonOutput) printCommandHeader("Clear reservation queue");
        const spinner = ora();
        const ctx = buildDotnsContext(context, {
          onStatus: makeOnStatus(spinner, "Clearing expired reservations on"),
        });

        const result = await maybeQuiet(jsonOutput, () => expireReservation(ctx, name));

        if (
          !emitJsonResult(jsonOutput, {
            label: result.label,
            cleared: result.cleared.toString(),
            txHash: result.txHash,
            queue: queueJson(result.queue),
          })
        ) {
          if (result.txHash === null) {
            console.log(
              chalk.gray("  nothing to clear: the queue is empty or its front is active"),
            );
          } else {
            console.log(chalk.gray("  cleared:   ") + chalk.white(result.cleared.toString()));
            console.log(chalk.gray("  tx:        ") + chalk.blue(result.txHash));
          }
          printQueue(result.queue);
          console.log(chalk.green("\n✓ Complete\n"));
        }
        process.exit(0);
      } catch (error) {
        handleCommandError(jsonOutput, error);
      }
    },
  );
}
