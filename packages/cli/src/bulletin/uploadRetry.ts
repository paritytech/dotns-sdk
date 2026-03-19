import {
  DEFAULT_UPLOAD_MAX_RETRIES,
  MAX_UPLOAD_MAX_RETRIES,
  UPLOAD_RETRY_BASE_DELAYS_MS,
} from "../utils/constants";
import { formatErrorMessage } from "../utils/formatting";

const RETRYABLE_UPLOAD_ERROR_MARKERS = [
  "stale",
  "ancientbirthblock",
  "timeout",
  "timed out",
  "temporarily",
  "connection",
  "network",
  "socket",
  "ws",
  "websocket",
  "rpc",
  "pool",
  "mempool",
  "priority",
  "future",
  "reset",
  "econn",
  "unavailable",
  "rate limit",
  "stop-call",
  "not pinned",
  "halt",
  "aborted",
  "terminated",
  "sigkill",
  "resource temporarily unavailable",
];

export type UploadRetryAttemptContext = {
  retry: number;
  nextAttempt: number;
  totalAttempts: number;
  maxRetries: number;
  delayMs: number;
  error: unknown;
};

type RunWithUploadRetriesOptions<T> = {
  maxRetries?: number;
  execute: (attempt: number, totalAttempts: number) => Promise<T>;
  onRetry?: (context: UploadRetryAttemptContext) => Promise<void> | void;
  isRetryable?: (error: unknown) => boolean;
  retryBaseDelaysMs?: readonly number[];
  sleep?: (milliseconds: number) => Promise<void>;
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeRetryBaseDelaysMs(delays: readonly number[] | undefined): readonly number[] {
  if (!delays || delays.length === 0) {
    return UPLOAD_RETRY_BASE_DELAYS_MS;
  }

  const normalized = delays
    .map((delay) => Math.max(0, Math.floor(delay)))
    .filter((delay) => Number.isFinite(delay));

  return normalized.length > 0 ? normalized : UPLOAD_RETRY_BASE_DELAYS_MS;
}

export function normalizeUploadMaxRetries(value: number | string | undefined): number {
  if (value === undefined) {
    return DEFAULT_UPLOAD_MAX_RETRIES;
  }

  const parsed =
    typeof value === "string"
      ? Number.parseInt(value.trim(), 10)
      : Number.isFinite(value)
        ? Math.floor(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `maxRetries must be a whole number between 0 and ${MAX_UPLOAD_MAX_RETRIES}`,
    );
  }

  return Math.min(parsed, MAX_UPLOAD_MAX_RETRIES);
}

export function isRetryableUploadError(error: unknown): boolean {
  const message = formatErrorMessage(error).toLowerCase();
  return RETRYABLE_UPLOAD_ERROR_MARKERS.some((marker) => message.includes(marker));
}

export async function runWithUploadRetries<T>(
  options: RunWithUploadRetriesOptions<T>,
): Promise<T> {
  const maxRetries = normalizeUploadMaxRetries(options.maxRetries);
  const totalAttempts = maxRetries + 1;
  const retryBaseDelaysMs = normalizeRetryBaseDelaysMs(options.retryBaseDelaysMs);
  const isRetryable = options.isRetryable ?? isRetryableUploadError;
  const sleep = options.sleep ?? wait;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      return await options.execute(attempt, totalAttempts);
    } catch (error) {
      const isLastAttempt = attempt >= totalAttempts - 1;
      if (isLastAttempt || !isRetryable(error)) {
        throw error;
      }

      const delayMs =
        retryBaseDelaysMs[Math.min(attempt, retryBaseDelaysMs.length - 1)] ??
        retryBaseDelaysMs[retryBaseDelaysMs.length - 1] ??
        0;

      await options.onRetry?.({
        retry: attempt + 1,
        nextAttempt: attempt + 2,
        totalAttempts,
        maxRetries,
        delayMs,
        error,
      });

      await sleep(delayMs);
    }
  }

  throw new Error("Upload retry loop exited unexpectedly");
}
