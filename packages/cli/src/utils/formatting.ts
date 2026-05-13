import chalk from "chalk";
import type { Ora } from "ora";
import { formatEther } from "viem";
import { printHumanDetail, printHumanFailure, printHumanSuccess } from "../cli/reporter";
import type { TransactionStatus } from "../types/types";
import { DEFAULT_NATIVE_TOKEN_DECIMALS, EVM_TOKEN_DECIMALS } from "./constants";

function normalizeNativeDecimals(decimals?: number): bigint {
  if (decimals == null || !Number.isInteger(decimals) || decimals < 0) {
    return BigInt(DEFAULT_NATIVE_TOKEN_DECIMALS);
  }
  return BigInt(decimals);
}

function getNativeToWeiRatio(nativeDecimals?: number): bigint {
  const decimals = normalizeNativeDecimals(nativeDecimals);
  const exponent = BigInt(EVM_TOKEN_DECIMALS) - decimals;
  if (exponent < 0n) {
    throw new Error(
      `Native token decimals (${decimals}) exceed EVM decimals (${EVM_TOKEN_DECIMALS})`,
    );
  }
  return 10n ** exponent;
}

export function formatNativeBalance(valueInNativeUnits: bigint, decimals?: number): string {
  const nativeDecimals = normalizeNativeDecimals(decimals);
  const divisor = 10n ** nativeDecimals;
  const wholePart = valueInNativeUnits / divisor;
  const fractionalPart = valueInNativeUnits % divisor;

  let fractionalString = fractionalPart.toString();
  const missingZeroCount = nativeDecimals - BigInt(fractionalString.length);
  if (missingZeroCount > 0n) {
    fractionalString = "0".repeat(Number(missingZeroCount)) + fractionalString;
  }

  return `${wholePart}.${fractionalString}`;
}

export function parseNativeBalance(decimalValue: string, decimals?: number): bigint {
  const nativeDecimals = normalizeNativeDecimals(decimals);
  const parts = decimalValue.split(".");
  const wholePart = BigInt(parts[0] || "0");
  const fractionalPart = parts[1] || "0";

  const paddedFraction = fractionalPart
    .padEnd(Number(nativeDecimals), "0")
    .slice(0, Number(nativeDecimals));

  return wholePart * 10n ** nativeDecimals + BigInt(paddedFraction);
}

export function convertNativeToWei(nativeValue: bigint, nativeDecimals?: number): bigint {
  return nativeValue * getNativeToWeiRatio(nativeDecimals);
}

export function convertWeiToNative(weiValue: bigint, nativeDecimals?: number): bigint {
  return weiValue / getNativeToWeiRatio(nativeDecimals);
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

export function formatBytes(bytes: number | bigint): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
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
