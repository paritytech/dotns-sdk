import chalk from "chalk";
import type { Ora } from "ora";
import { printHumanDetail, printHumanFailure, printHumanSuccess } from "./reporter";
import type { TransactionStatus } from "../types/types";
import type { OperationStatus } from "../core/context";

function createTransactionStatusHandler(
  spinner?: Ora,
  operationName?: string,
): (status: TransactionStatus) => void {
  let lastUpdateTimestamp = Date.now();
  let startTimestamp = Date.now();

  return (status: TransactionStatus) => {
    const currentTimestamp = Date.now();
    const elapsedSeconds = Math.floor((currentTimestamp - startTimestamp) / 1000);

    if (!spinner) {
      switch (status) {
        case "signing":
          printHumanDetail(chalk.cyan("Signing transaction"));
          break;
        case "broadcasting":
          printHumanDetail(chalk.blue("Broadcasting to network"));
          break;
        case "included":
          printHumanDetail(chalk.magenta("Included in block"));
          break;
        case "finalized":
          printHumanSuccess(chalk.green(`Finalized (${elapsedSeconds}s)`));
          break;
        case "failed":
          printHumanFailure(chalk.red("Transaction failed"));
          break;
      }
      return;
    }

    switch (status) {
      case "signing":
        spinner.color = "cyan";
        spinner.text = `Signing ${operationName || "transaction"}`;
        startTimestamp = currentTimestamp;
        lastUpdateTimestamp = currentTimestamp;
        break;

      case "broadcasting":
        spinner.color = "blue";
        spinner.text = `Broadcasting ${operationName || "transaction"}`;
        lastUpdateTimestamp = currentTimestamp;
        break;

      case "included": {
        const secondsSinceIncluded = Math.floor((currentTimestamp - lastUpdateTimestamp) / 1000);
        spinner.color = "magenta";
        spinner.text =
          secondsSinceIncluded > 3
            ? `Waiting for finalization (${secondsSinceIncluded}s)`
            : "Included in block, awaiting finalization";
        break;
      }

      case "finalized":
        spinner.succeed(
          chalk.green(`${operationName || "Transaction"} finalized (${elapsedSeconds}s)`),
        );
        break;

      case "failed":
        spinner.fail(chalk.red(`${operationName || "Transaction"} failed`));
        break;
    }
  };
}

// Bridges a core operation's OperationStatus stream onto a CLI spinner: the read/
// wait/mapping phases update spinner text, transaction phases defer to the handler
// above. Pass the result as `onStatus` when building a DotnsContext in the CLI.
export function makeOnStatus(
  spinner?: Ora,
  operationName?: string,
): (status: OperationStatus) => void {
  const txHandler = createTransactionStatusHandler(spinner, operationName);
  return (status: OperationStatus) => {
    switch (status) {
      case "reading":
        // Reads are short and have no terminal event to stop the spinner, so only
        // set the label; the slow phases below own the animation and its clean stop.
        if (spinner) spinner.text = operationName ? `Reading ${operationName}` : "Reading";
        return;
      case "waiting":
        if (spinner) spinner.start("Waiting for commitment to mature");
        return;
      case "mapping":
        if (spinner) spinner.start("Mapping account");
        return;
      default:
        // Start the animation before the transaction-phase handler updates its text;
        // finalized/failed are terminal and stop the spinner via succeed/fail.
        if (spinner && !spinner.isSpinning && status !== "finalized" && status !== "failed") {
          spinner.start();
        }
        txHandler(status);
    }
  };
}
