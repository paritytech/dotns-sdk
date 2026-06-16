import { formatEther } from "viem";
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

export function convertWeiToNative(weiValue: bigint, nativeDecimals?: number): bigint {
  return weiValue / getNativeToWeiRatio(nativeDecimals);
}

export function convertWeiToNativeCeil(weiValue: bigint, nativeDecimals?: number): bigint {
  const ratio = getNativeToWeiRatio(nativeDecimals);
  return (weiValue + ratio - 1n) / ratio;
}

export function formatWeiAsEther(weiValue: bigint): string {
  return formatEther(weiValue);
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

export function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error(formatErrorMessage(error));
}

export function formatDispatchError(dispatchError: unknown): string {
  if (!dispatchError) return "Unknown error";
  if (typeof dispatchError === "string") return dispatchError;
  const error = dispatchError as { type?: string; value?: unknown };
  if (error.type === "Module") {
    const moduleError = error.value as { type: string; value?: { type: string } };
    return `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
  }
  return error.type ?? formatErrorMessage(dispatchError);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  operationName: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${operationName} timed out after ${timeoutMilliseconds}ms`));
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
