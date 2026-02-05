import chalk from "chalk";
import type { Ora } from "ora";
import { formatEther } from "viem";
import type { TransactionStatus } from "../types/types";
import { DECIMALS, NATIVE_TO_ETH_RATIO } from "./constants";

export function formatNativeBalance(valueInNativeUnits: bigint): string {
  const divisor = 10n ** DECIMALS;
  const wholePart = valueInNativeUnits / divisor;
  const fractionalPart = valueInNativeUnits % divisor;

  let fractionalString = fractionalPart.toString();
  const missingZeroCount = DECIMALS - BigInt(fractionalString.length);
  if (missingZeroCount > 0n) {
    fractionalString = "0".repeat(Number(missingZeroCount)) + fractionalString;
  }

  return `${wholePart}.${fractionalString}`;
}

export function parseNativeBalance(decimalValue: string): bigint {
  const parts = decimalValue.split(".");
  const wholePart = BigInt(parts[0] || "0");
  const fractionalPart = parts[1] || "0";

  const paddedFraction = fractionalPart.padEnd(Number(DECIMALS), "0").slice(0, Number(DECIMALS));

  return wholePart * 10n ** DECIMALS + BigInt(paddedFraction);
}

export function convertNativeToWei(nativeValue: bigint): bigint {
  return nativeValue * NATIVE_TO_ETH_RATIO;
}

export function convertWeiToNative(weiValue: bigint): bigint {
  return weiValue / NATIVE_TO_ETH_RATIO;
}

export function formatWeiAsEther(weiValue: bigint): string {
  return formatEther(weiValue);
}

export function createTransactionStatusHandler(
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
          console.log(chalk.cyan("  ✍  Signing transaction"));
          break;
        case "broadcasting":
          console.log(chalk.blue("  📡 Broadcasting to network"));
          break;
        case "included":
          console.log(chalk.magenta("  📦 Included in block"));
          break;
        case "finalized":
          console.log(chalk.green(`  ✓  Finalized (${elapsedSeconds}s)`));
          break;
        case "failed":
          console.log(chalk.red("  ✗  Transaction failed"));
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

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  operationName: string,
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(
      () => reject(new Error(`${operationName} timed out after ${timeoutMilliseconds}ms`)),
      timeoutMilliseconds,
    );
  });

  return Promise.race([promise, timeoutPromise]);
}
