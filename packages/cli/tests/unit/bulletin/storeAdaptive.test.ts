import { describe, expect, test } from "bun:test";
import {
  buildOrderedStoredChunks,
  clampChunkSizeBytes,
  computeNextAdaptiveWindow,
  runWaveWithRetries,
  selectWaveChunks,
  type UploadWaveChunk,
} from "../../../src/bulletin/store";
import {
  isRetryableUploadError as isRetryableTopLevelUploadError,
  normalizeUploadMaxRetries as normalizeTopLevelUploadMaxRetries,
  runWithUploadRetries as runTopLevelUploadWithRetries,
} from "../../../src/bulletin/uploadRetry";

describe("adaptive window controller", () => {
  test("increases by one after two consecutive clean waves", () => {
    const first = computeNextAdaptiveWindow({
      currentWindow: 1,
      maxWindow: 4,
      cleanWaveStreak: 0,
      waveDurationMs: 5_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(first.nextWindow).toBe(1);
    expect(first.nextCleanWaveStreak).toBe(1);

    const second = computeNextAdaptiveWindow({
      currentWindow: first.nextWindow,
      maxWindow: 4,
      cleanWaveStreak: first.nextCleanWaveStreak,
      waveDurationMs: 6_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(second.nextWindow).toBe(2);
    expect(second.nextCleanWaveStreak).toBe(0);
  });

  test("halves the window on retryable errors", () => {
    const next = computeNextAdaptiveWindow({
      currentWindow: 4,
      maxWindow: 4,
      cleanWaveStreak: 1,
      waveDurationMs: 4_000,
      hadRetryableFailures: true,
      hadRetries: true,
    });

    expect(next.nextWindow).toBe(2);
    expect(next.nextCleanWaveStreak).toBe(0);
  });

  test("halves the window on slow waves", () => {
    const next = computeNextAdaptiveWindow({
      currentWindow: 3,
      maxWindow: 4,
      cleanWaveStreak: 1,
      waveDurationMs: 30_000,
      hadRetryableFailures: false,
      hadRetries: false,
    });

    expect(next.nextWindow).toBe(1);
    expect(next.nextCleanWaveStreak).toBe(0);
  });
});

describe("wave chunk selection", () => {
  test("never exceeds in-flight byte budget", () => {
    const queue: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "a" },
      { index: 1, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "b" },
      { index: 2, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "c" },
      { index: 3, bytes: new Uint8Array(3 * 1024 * 1024), length: 3 * 1024 * 1024, cid: "d" },
    ];

    const selected = selectWaveChunks(queue, 4, 8 * 1024 * 1024);
    const selectedBytes = selected.reduce((sum, chunk) => sum + chunk.length, 0);

    expect(selected.length).toBe(2);
    expect(selectedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(queue.length).toBe(2);
  });

  test("throws when a single chunk exceeds budget", () => {
    const queue: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array(9 * 1024 * 1024), length: 9 * 1024 * 1024, cid: "a" },
    ];

    expect(() => selectWaveChunks(queue, 1, 8 * 1024 * 1024)).toThrow(
      "exceeds in-flight byte budget",
    );
  });
});

describe("chunk size clamping", () => {
  test("uses memory-safe defaults and bounds", () => {
    expect(clampChunkSizeBytes(undefined)).toBe(2 * 1024 * 1024);
    expect(clampChunkSizeBytes(128 * 1024)).toBe(256 * 1024);
    expect(clampChunkSizeBytes(8 * 1024 * 1024)).toBe(2 * 1024 * 1024);
  });
});

describe("chunk metadata ordering", () => {
  test("builds deterministic order from out-of-order map", () => {
    const completedByIndex = new Map([
      [2, { index: 2, cid: "cid-2", length: 30 }],
      [0, { index: 0, cid: "cid-0", length: 10 }],
      [1, { index: 1, cid: "cid-1", length: 20 }],
    ]);

    const ordered = buildOrderedStoredChunks(3, completedByIndex);
    expect(ordered.map((entry) => entry.cid)).toEqual(["cid-0", "cid-1", "cid-2"]);
  });
});

describe("wave retry behavior", () => {
  test("retries only failed chunks", async () => {
    const waveChunks: UploadWaveChunk[] = [
      { index: 0, bytes: new Uint8Array([1]), length: 1, cid: "cid-0" },
      { index: 1, bytes: new Uint8Array([2]), length: 1, cid: "cid-1" },
      { index: 2, bytes: new Uint8Array([3]), length: 1, cid: "cid-2" },
    ];

    const attempts = new Map<number, number>();

    const result = await runWaveWithRetries({
      waveChunks,
      jitterMs: () => 0,
      submitChunk: async (chunk, retryAttempt) => {
        const current = attempts.get(chunk.index) ?? 0;
        attempts.set(chunk.index, current + 1);

        if (chunk.index === 1 && retryAttempt === 0) {
          throw new Error("network timeout");
        }
      },
    });

    expect(result.retries).toBe(1);
    expect(result.attemptedSubmissions).toBe(4);
    expect(attempts.get(0)).toBe(1);
    expect(attempts.get(1)).toBe(2);
    expect(attempts.get(2)).toBe(1);
  });
});

describe("top-level upload retry policy", () => {
  test("uses the default retry count when unset", () => {
    expect(normalizeTopLevelUploadMaxRetries(undefined)).toBe(5);
  });

  test("caps retry count at the hard limit", () => {
    expect(normalizeTopLevelUploadMaxRetries(99)).toBe(20);
    expect(normalizeTopLevelUploadMaxRetries("99")).toBe(20);
  });

  test("rejects invalid retry counts", () => {
    expect(() => normalizeTopLevelUploadMaxRetries(-1)).toThrow(
      "maxRetries must be a whole number between 0 and 20",
    );
    expect(() => normalizeTopLevelUploadMaxRetries("abc")).toThrow(
      "maxRetries must be a whole number between 0 and 20",
    );
  });

  test("recognises transient Bulletin and transport failures", () => {
    expect(isRetryableTopLevelUploadError(new Error("Block xyz is not pinned (stop-call)"))).toBe(
      true,
    );
    expect(isRetryableTopLevelUploadError(new Error("WebSocket connection reset by peer"))).toBe(
      true,
    );
    expect(isRetryableTopLevelUploadError(new Error("upload worker exited with SIGKILL"))).toBe(
      true,
    );
  });

  test("does not retry non-transient failures", () => {
    expect(isRetryableTopLevelUploadError(new Error("Payment required"))).toBe(false);
    expect(isRetryableTopLevelUploadError(new Error("Account is not authorized"))).toBe(false);
  });

  test("retries retryable failures until success", async () => {
    const attempts: number[] = [];
    const retryDelays: number[] = [];
    const retryLog: Array<{ retry: number; nextAttempt: number; totalAttempts: number }> = [];

    const result = await runTopLevelUploadWithRetries({
      maxRetries: 3,
      retryBaseDelaysMs: [10, 20, 30],
      sleep: async (delayMs) => {
        retryDelays.push(delayMs);
      },
      onRetry: ({ retry, nextAttempt, totalAttempts }) => {
        retryLog.push({ retry, nextAttempt, totalAttempts });
      },
      execute: async (attempt) => {
        attempts.push(attempt);
        if (attempt < 2) {
          throw new Error("ws connection reset");
        }
        return "cid-123";
      },
    });

    expect(result).toBe("cid-123");
    expect(attempts).toEqual([0, 1, 2]);
    expect(retryDelays).toEqual([10, 20]);
    expect(retryLog).toEqual([
      { retry: 1, nextAttempt: 2, totalAttempts: 4 },
      { retry: 2, nextAttempt: 3, totalAttempts: 4 },
    ]);
  });

  test("stops immediately for non-retryable failures", async () => {
    await expect(
      runTopLevelUploadWithRetries({
        maxRetries: 3,
        sleep: async () => undefined,
        execute: async () => {
          throw new Error("Payment required");
        },
      }),
    ).rejects.toThrow("Payment required");
  });

  test("stops after exhausting the retry budget", async () => {
    let attempts = 0;

    await expect(
      runTopLevelUploadWithRetries({
        maxRetries: 2,
        retryBaseDelaysMs: [1],
        sleep: async () => undefined,
        execute: async () => {
          attempts += 1;
          throw new Error("rpc timeout");
        },
      }),
    ).rejects.toThrow("rpc timeout");

    expect(attempts).toBe(3);
  });
});
