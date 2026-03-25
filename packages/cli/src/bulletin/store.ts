import { Binary } from "@polkadot-api/substrate-bindings";
import { promises as fs } from "node:fs";
import { createClient as createPolkadotClient } from "polkadot-api";
import type { PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { config as rxjsConfig } from "rxjs";
import { bulletin } from "@polkadot-api/descriptors";
import { createRawCid, createDagPbCid, CODEC, HASH } from "./cid";
import {
  createUploadFingerprint,
  createUploadManifestId,
  deleteManifest,
  saveManifest,
} from "./uploadManifest";
import { isReconnectRequiredUploadError, isRetryableUploadError } from "./uploadRetry";
import type {
  HashingEnumVariant,
  StoreContentParameters,
  BulletinStoreResult,
  StoreSingleFileParameters,
  StoreChunkedFileParameters,
  ChunkedStoreResult,
  StoreBlockParameters,
  UploadManifest,
  UploadManifestCompletedBlock,
  UploadWaveSummary,
} from "../types/types";

const MAXIMUM_TRANSACTION_SIZE = 8 * 1024 * 1024;
const MAX_IN_FLIGHT_BYTES = 8 * 1024 * 1024;
const MIN_CHUNK_SIZE_BYTES = 256 * 1024;
const DEFAULT_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const ADAPTIVE_WINDOW_MIN = 1;
const ADAPTIVE_WINDOW_START = 1;
const ADAPTIVE_WINDOW_DEFAULT_MAX = 4;
const CLEAN_WAVE_DURATION_THRESHOLD_MS = 12_000;
const SLOW_WAVE_DURATION_THRESHOLD_MS = 25_000;
const MAX_RETRIES_PER_CHUNK = 3;
const RETRY_BASE_DELAYS_MS = [200, 400, 800] as const;
const WAVE_TIMEOUT_MS = 60_000;
const STORE_CALL_TIMEOUT_MS = 60_000;
export const FINAL_STORE_CALL_TIMEOUT_MS = 180_000;
const FETCH_NONCE_TIMEOUT_MS = 15_000;
let rxUnhandledErrorGuardInstalled = false;

export type AdaptiveWindowUpdateInput = {
  currentWindow: number;
  maxWindow: number;
  cleanWaveStreak: number;
  waveDurationMs: number;
  hadRetryableFailures: boolean;
  hadRetries: boolean;
};

export type AdaptiveWindowUpdateOutput = {
  nextWindow: number;
  nextCleanWaveStreak: number;
};

export type UploadWaveChunk = {
  index: number;
  bytes: Uint8Array;
  length: number;
  cid: string;
};

type WaveSubmitFailure = {
  chunk: UploadWaveChunk;
  error: Error;
  retryable: boolean;
};

type WaveSubmitResult = {
  retries: number;
  retryableFailures: number;
  attemptedSubmissions: number;
};

type ManifestState = {
  id: string;
  fingerprint: string;
  inputPath: string;
  fileSize: number;
  fileMtimeMs: number;
  chunkSize: number;
  totalBlocks: number;
  completedBlocks: Map<number, UploadManifestCompletedBlock>;
  rootCid?: string;
};

function formatDispatchError(dispatchError: { type: string; value?: unknown }): string {
  if (dispatchError.type === "Module") {
    const moduleError = dispatchError.value as {
      type: string;
      value?: { type: string };
    };
    return `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
  }
  return dispatchError.type;
}

function ensureError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

function isBenignClientDestroyError(error: unknown): boolean {
  const message = ensureError(error).message.toLowerCase();
  return (
    message.includes("chainhead disjointed") ||
    message.includes("chainhead stopped") ||
    (message.includes("unsubscriptionerror") && message.includes("not connected"))
  );
}

function installRxUnhandledErrorGuard(): void {
  if (rxUnhandledErrorGuardInstalled) return;
  rxUnhandledErrorGuardInstalled = true;

  const previousHandler = rxjsConfig.onUnhandledError;
  rxjsConfig.onUnhandledError = (error: unknown) => {
    if (isBenignClientDestroyError(error)) return;
    previousHandler?.(error);
  };

  process.on("unhandledRejection", (reason: unknown) => {
    if (isBenignClientDestroyError(reason)) return;
    throw reason;
  });
}

function randomJitterMs(maxJitterMs = 100): number {
  return Math.floor(Math.random() * maxJitterMs);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeRpcNonce(result: unknown): number {
  if (typeof result === "number" && Number.isFinite(result)) {
    return Math.max(0, Math.floor(result));
  }

  if (typeof result === "string") {
    if (result.startsWith("0x")) {
      return Number.parseInt(result.slice(2), 16);
    }
    return Number.parseInt(result, 10);
  }

  throw new Error(`Unexpected nonce response: ${String(result)}`);
}

function isRetryableSubmissionError(error: unknown): boolean {
  return isRetryableUploadError(error);
}

function convertHashCodeToEnum(hashCode: number): HashingEnumVariant {
  switch (hashCode) {
    case HASH.SHA2_256:
      return { type: "Sha2_256", value: undefined };
    case HASH.BLAKE2B_256:
      return { type: "Blake2b256", value: undefined };
    default:
      throw new Error(`Unsupported hash code: 0x${hashCode.toString(16)}`);
  }
}

export function clampChunkSizeBytes(chunkSize: number | undefined): number {
  const requested = Number.isFinite(chunkSize as number)
    ? Math.floor(Number(chunkSize))
    : DEFAULT_CHUNK_SIZE_BYTES;

  if (requested < MIN_CHUNK_SIZE_BYTES) return MIN_CHUNK_SIZE_BYTES;
  if (requested > MAX_CHUNK_SIZE_BYTES) return MAX_CHUNK_SIZE_BYTES;
  return requested;
}

function sanitizeWindowLimit(windowLimit: number | undefined): number {
  if (!Number.isFinite(windowLimit as number)) {
    return ADAPTIVE_WINDOW_DEFAULT_MAX;
  }

  const rounded = Math.max(ADAPTIVE_WINDOW_MIN, Math.floor(Number(windowLimit)));
  return Math.min(ADAPTIVE_WINDOW_DEFAULT_MAX, rounded);
}

function toManifest(state: ManifestState): UploadManifest {
  const nowIso = new Date().toISOString();
  return {
    version: 1,
    id: state.id,
    fingerprint: state.fingerprint,
    inputPath: state.inputPath,
    fileSize: state.fileSize,
    fileMtimeMs: state.fileMtimeMs,
    chunkSize: state.chunkSize,
    totalBlocks: state.totalBlocks,
    completedBlocks: [...state.completedBlocks.values()].sort((a, b) => a.index - b.index),
    rootCid: state.rootCid,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    type: "file",
  };
}

async function persistManifest(state: ManifestState): Promise<void> {
  await saveManifest(toManifest(state));
}

function createManifestState(parameters: {
  filePath: string;
  fileSize: number;
  fileMtimeMs: number;
  chunkSize: number;
  totalBlocks: number;
  completedBlocks?: Map<number, UploadManifestCompletedBlock>;
}): ManifestState {
  const identity = {
    inputPath: parameters.filePath,
    fileSize: parameters.fileSize,
    fileMtimeMs: parameters.fileMtimeMs,
    chunkSize: parameters.chunkSize,
  };

  const dedupedCompletedBlocks = new Map<number, UploadManifestCompletedBlock>();
  for (const completed of parameters.completedBlocks?.values() ?? []) {
    dedupedCompletedBlocks.set(completed.index, completed);
  }

  return {
    id: createUploadManifestId(identity),
    fingerprint: createUploadFingerprint(identity),
    inputPath: parameters.filePath,
    fileSize: parameters.fileSize,
    fileMtimeMs: parameters.fileMtimeMs,
    chunkSize: parameters.chunkSize,
    totalBlocks: parameters.totalBlocks,
    completedBlocks: dedupedCompletedBlocks,
  };
}

async function* streamFileChunks(
  filePath: string,
  chunkSize: number,
): AsyncGenerator<{ index: number; bytes: Uint8Array; length: number }> {
  const handle = await fs.open(filePath, "r");
  let chunkIndex = 0;

  try {
    while (true) {
      const buffer = Buffer.allocUnsafe(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, null);
      if (bytesRead <= 0) break;

      const bytes = bytesRead === chunkSize ? buffer : buffer.subarray(0, bytesRead);
      yield {
        index: chunkIndex,
        bytes,
        length: bytes.length,
      };

      chunkIndex += 1;
    }
  } finally {
    await handle.close();
  }
}

export function buildOrderedStoredChunks(
  totalChunks: number,
  completedByIndex: Map<number, UploadManifestCompletedBlock>,
): Array<{ index: number; cid: string; length: number }> {
  const ordered: Array<{ index: number; cid: string; length: number }> = [];

  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = completedByIndex.get(index);
    if (!chunk) {
      throw new Error(`Missing stored metadata for chunk ${index + 1}/${totalChunks}`);
    }
    ordered.push({ index, cid: chunk.cid, length: chunk.length });
  }

  return ordered;
}

export function selectWaveChunks(
  queue: UploadWaveChunk[],
  window: number,
  maxInFlightBytes: number = MAX_IN_FLIGHT_BYTES,
): UploadWaveChunk[] {
  const selected: UploadWaveChunk[] = [];
  let inFlightBytes = 0;

  while (selected.length < window && queue.length > 0) {
    const candidate = queue[0];
    if (!candidate) break;

    if (candidate.length > maxInFlightBytes) {
      throw new Error(
        `Chunk ${candidate.index + 1} (${candidate.length} bytes) exceeds in-flight byte budget of ${maxInFlightBytes} bytes`,
      );
    }

    const nextInFlightBytes = inFlightBytes + candidate.length;
    if (selected.length > 0 && nextInFlightBytes > maxInFlightBytes) {
      break;
    }

    queue.shift();
    selected.push(candidate);
    inFlightBytes = nextInFlightBytes;
  }

  return selected;
}

export function computeNextAdaptiveWindow(
  input: AdaptiveWindowUpdateInput,
): AdaptiveWindowUpdateOutput {
  const maxWindow = Math.max(ADAPTIVE_WINDOW_MIN, input.maxWindow);

  if (
    input.hadRetryableFailures ||
    input.hadRetries ||
    input.waveDurationMs > SLOW_WAVE_DURATION_THRESHOLD_MS
  ) {
    return {
      nextWindow: Math.max(ADAPTIVE_WINDOW_MIN, Math.floor(input.currentWindow / 2)),
      nextCleanWaveStreak: 0,
    };
  }

  const cleanWave = input.waveDurationMs < CLEAN_WAVE_DURATION_THRESHOLD_MS;
  if (!cleanWave) {
    return {
      nextWindow: input.currentWindow,
      nextCleanWaveStreak: 0,
    };
  }

  const nextCleanWaveStreak = input.cleanWaveStreak + 1;
  if (nextCleanWaveStreak >= 2) {
    return {
      nextWindow: Math.min(maxWindow, input.currentWindow + 1),
      nextCleanWaveStreak: 0,
    };
  }

  return {
    nextWindow: input.currentWindow,
    nextCleanWaveStreak,
  };
}

export async function runWaveWithRetries(parameters: {
  waveChunks: UploadWaveChunk[];
  submitChunk: (chunk: UploadWaveChunk, retryAttempt: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
  maxRetries?: number;
  retryBaseDelaysMs?: readonly number[];
  jitterMs?: () => number;
}): Promise<WaveSubmitResult> {
  const maxRetries = parameters.maxRetries ?? MAX_RETRIES_PER_CHUNK;
  const retryBaseDelaysMs = parameters.retryBaseDelaysMs ?? RETRY_BASE_DELAYS_MS;
  const isRetryable = parameters.isRetryable ?? isRetryableSubmissionError;
  const jitterMs = parameters.jitterMs ?? randomJitterMs;

  let retryableFailures = 0;
  let retries = 0;
  let attemptedSubmissions = 0;
  let pending = [...parameters.waveChunks];

  for (let retryAttempt = 0; pending.length > 0; retryAttempt += 1) {
    const currentBatch = pending;
    pending = [];

    const results = await Promise.all(
      currentBatch.map(async (chunk) => {
        attemptedSubmissions += 1;
        try {
          await parameters.submitChunk(chunk, retryAttempt);
          return null;
        } catch (error) {
          const normalizedError = ensureError(error);
          return {
            chunk,
            error: normalizedError,
            retryable: isRetryable(normalizedError),
          } as WaveSubmitFailure;
        }
      }),
    );

    const failures = results.filter((result): result is WaveSubmitFailure => result !== null);
    if (failures.length === 0) {
      break;
    }

    const retryCandidates: UploadWaveChunk[] = [];
    for (const failure of failures) {
      if (failure.retryable && retryAttempt < maxRetries) {
        retryCandidates.push(failure.chunk);
      } else {
        throw failure.error;
      }
    }

    if (retryCandidates.length === 0) {
      break;
    }

    retries += retryCandidates.length;
    retryableFailures += retryCandidates.length;
    pending = retryCandidates;

    const baseDelay =
      retryBaseDelaysMs[Math.min(retryAttempt, retryBaseDelaysMs.length - 1)] ??
      retryBaseDelaysMs[retryBaseDelaysMs.length - 1] ??
      0;
    await sleep(baseDelay + Math.max(0, jitterMs()));
  }

  return { retries, retryableFailures, attemptedSubmissions };
}

export function destroyBulletinClient(
  client: Pick<PolkadotClient, "destroy"> | undefined | null,
): void {
  if (!client) return;
  try {
    client.destroy();
  } catch {
    /* benign — chainhead disjointed or already closed */
  }
}

export type TransactionWatchFailureEvent = {
  type: string;
  dispatchError?: { type: string; value?: unknown };
  error?: unknown;
  reason?: string;
};

export function formatTransactionWatchFailure(
  event: TransactionWatchFailureEvent,
  fallbackMessage = `Transaction ${event.type}`,
): string {
  if (event.dispatchError) {
    return formatDispatchError(event.dispatchError);
  }
  if (event.error !== undefined) {
    return ensureError(event.error).message;
  }
  if (event.reason) {
    return event.reason;
  }
  return fallbackMessage;
}

export function createBulletinClient(rpc: string): PolkadotClient {
  installRxUnhandledErrorGuard();
  return createPolkadotClient(withPolkadotSdkCompat(getWsProvider(rpc)));
}

async function storeContentOnBulletin(
  parameters: StoreContentParameters,
): Promise<BulletinStoreResult> {
  const {
    rpc,
    signer,
    contentBytes,
    contentCid,
    codecValue,
    hashCodeValue,
    nonce,
    onProgress,
    client: externalClient,
    storeTimeoutMs = STORE_CALL_TIMEOUT_MS,
    waitForFinalization = true,
  } = parameters;

  if (contentBytes.length > MAXIMUM_TRANSACTION_SIZE) {
    throw new Error(
      `Content size ${contentBytes.length} bytes exceeds maximum transaction size of 8MB`,
    );
  }

  const isExternalClient = !!externalClient;
  const client = externalClient ?? createBulletinClient(rpc);
  const typedApi = client.getTypedApi(bulletin);

  if (!typedApi.tx.TransactionStorage?.store_with_cid_config) {
    if (!isExternalClient) client.destroy();
    throw new Error("TransactionStorage.store_with_cid_config is not available on this chain");
  }

  const storeTransaction = typedApi.tx.TransactionStorage.store_with_cid_config({
    cid: {
      codec: BigInt(codecValue),
      hashing: convertHashCodeToEnum(hashCodeValue),
    },
    data: Binary.fromBytes(contentBytes),
  });

  const transactionOptions: Record<string, unknown> = {};

  if (nonce !== undefined) {
    transactionOptions.nonce = nonce;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup(subscription);
      reject(new Error("store-timeout"));
    }, storeTimeoutMs);

    function cleanup(sub?: { unsubscribe: () => void }): void {
      clearTimeout(timeout);
      try {
        sub?.unsubscribe();
      } catch {
        /* already destroyed */
      }
      if (!isExternalClient) {
        try {
          client.destroy();
        } catch {
          /* already destroyed */
        }
      }
    }

    try {
      subscription = storeTransaction
        .signSubmitAndWatch(signer as never, transactionOptions)
        .subscribe({
          next: (event: any) => {
            if (settled) return;
            switch (event.type) {
              case "signed":
                onProgress?.("signing");
                break;
              case "broadcasted":
                onProgress?.("broadcasting");
                break;
              case "txBestBlocksState":
                onProgress?.("included");
                if (!waitForFinalization && event.found) {
                  settled = true;
                  if (event.ok) {
                    const storedEvent = event.events?.find(
                      (eventItem: { type: string; value: { type: string } }) =>
                        eventItem.type === "TransactionStorage" &&
                        eventItem.value.type === "Stored",
                    );
                    const storedIndex = (
                      storedEvent?.value as { value?: { index?: { toString?: () => string } } }
                    )?.value?.index?.toString?.();
                    cleanup(subscription);
                    resolve({ cid: contentCid, storedIndex, blockHash: event.block?.hash });
                  } else {
                    const errorMessage = event.dispatchError
                      ? formatDispatchError(event.dispatchError)
                      : "Transaction failed";
                    cleanup(subscription);
                    reject(new Error(errorMessage));
                  }
                }
                break;
              case "finalized":
                settled = true;
                if (event.ok) {
                  const storedEvent = event.events?.find(
                    (eventItem: { type: string; value: { type: string } }) =>
                      eventItem.type === "TransactionStorage" && eventItem.value.type === "Stored",
                  );
                  const storedIndex = (
                    storedEvent?.value as { value?: { index?: { toString?: () => string } } }
                  )?.value?.index?.toString?.();
                  onProgress?.("finalized");
                  cleanup(subscription);
                  resolve({ cid: contentCid, storedIndex, blockHash: event.block?.hash });
                } else {
                  const errorMessage = event.dispatchError
                    ? formatDispatchError(event.dispatchError)
                    : "Transaction failed";
                  cleanup(subscription);
                  reject(new Error(errorMessage));
                }
                break;
            }
          },
          error: (error) => {
            if (settled) return;
            settled = true;
            cleanup(subscription);
            reject(ensureError(error));
          },
        });
    } catch (error) {
      if (settled) return;
      settled = true;
      cleanup(subscription);
      reject(ensureError(error));
    }
  });
}

export async function storeSingleFileToBulletin(
  parameters: StoreSingleFileParameters,
): Promise<BulletinStoreResult> {
  const cidObject = createRawCid(parameters.contentBytes, HASH.SHA2_256);
  const cidString = cidObject.toString();
  const waitForFinalization = parameters.waitForFinalization ?? false;

  return storeContentOnBulletin({
    rpc: parameters.rpc,
    signer: parameters.signer,
    contentBytes: parameters.contentBytes,
    contentCid: cidString,
    codecValue: CODEC.RAW,
    hashCodeValue: HASH.SHA2_256,
    onProgress: parameters.onProgress,
    client: parameters.client,
    waitForFinalization,
  });
}

export async function storeChunkedFileToBulletin(
  parameters: StoreChunkedFileParameters,
): Promise<ChunkedStoreResult> {
  const dagPbModule = await import("@ipld/dag-pb");
  const { UnixFS } = await import("ipfs-unixfs");
  const { CID } = await import("multiformats/cid");

  const chunkSize = clampChunkSizeBytes(parameters.chunkSize);
  const maxWindow = sanitizeWindowLimit(parameters.concurrency);
  let window = Math.min(maxWindow, ADAPTIVE_WINDOW_START);
  let cleanWaveStreak = 0;

  const waitForFinalization = parameters.waitForFinalization ?? false;
  const fileStats = await fs.stat(parameters.filePath);
  const totalChunks = Math.ceil(parameters.fileSize / chunkSize);

  const manifestState = createManifestState({
    filePath: parameters.filePath,
    fileSize: parameters.fileSize,
    fileMtimeMs: fileStats.mtimeMs,
    chunkSize,
    totalBlocks: totalChunks,
    completedBlocks: parameters.completedBlocks,
  });

  await persistManifest(manifestState);

  let completedChunks = 0;
  let totalRetries = 0;
  let waveNumber = 0;

  const queue: UploadWaveChunk[] = [];
  const chunkIterator = streamFileChunks(parameters.filePath, chunkSize)[Symbol.asyncIterator]();
  let reachedEndOfStream = false;

  let activeClient = parameters.client ?? createBulletinClient(parameters.rpc);
  const ownsClient = !parameters.client;

  const recreateOwnedClient = () => {
    if (!ownsClient) return;
    try {
      activeClient.destroy();
    } catch {
      /* already closed */
    }
    activeClient = createBulletinClient(parameters.rpc);
  };

  const startingNonce = await fetchAccountNonce(parameters.rpc, parameters.accountAddress);
  let nextNonce = startingNonce;

  const emitSchedulerState = (inFlightBytes: number, inFlightChunks: number) => {
    parameters.onSchedulerState?.({
      timestampMs: Date.now(),
      window,
      inFlightBytes,
      inFlightChunks,
      completedChunks,
      retries: totalRetries,
    });
  };

  const pushChunkFromStream = async (): Promise<boolean> => {
    const nextChunk = await chunkIterator.next();
    if (nextChunk.done) {
      reachedEndOfStream = true;
      return false;
    }

    const { index, bytes, length } = nextChunk.value;
    const chunkCid = createRawCid(bytes, HASH.SHA2_256).toString();
    const alreadyCompleted = manifestState.completedBlocks.get(index);

    if (
      alreadyCompleted &&
      alreadyCompleted.cid === chunkCid &&
      alreadyCompleted.length === length
    ) {
      completedChunks += 1;
      parameters.onProgress?.(index + 1, totalChunks, "skipped");
      return true;
    }

    manifestState.completedBlocks.delete(index);
    queue.push({ index, bytes, length, cid: chunkCid });
    return true;
  };

  try {
    emitSchedulerState(0, 0);

    while (!reachedEndOfStream || queue.length > 0) {
      while (!reachedEndOfStream && queue.length < maxWindow) {
        const hadChunk = await pushChunkFromStream();
        if (!hadChunk) break;
      }

      if (queue.length === 0) {
        continue;
      }

      const waveChunks = selectWaveChunks(queue, window, MAX_IN_FLIGHT_BYTES);
      const inFlightBytes = waveChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      if (inFlightBytes > MAX_IN_FLIGHT_BYTES) {
        throw new Error(
          `In-flight bytes (${inFlightBytes}) exceed hard budget (${MAX_IN_FLIGHT_BYTES})`,
        );
      }

      waveNumber += 1;
      const startedAtMs = Date.now();
      emitSchedulerState(inFlightBytes, waveChunks.length);

      parameters.onProgress?.((waveChunks[0]?.index ?? 0) + 1, totalChunks, "uploading-wave");

      const waveNonces = new Map<number, number>();
      for (const chunk of waveChunks) {
        waveNonces.set(chunk.index, nextNonce);
        nextNonce += 1;
      }

      try {
        const wavePromise = runWaveWithRetries({
          waveChunks,
          isRetryable: (error) =>
            isRetryableUploadError(error) && !isReconnectRequiredUploadError(error),
          submitChunk: async (chunk) => {
            const nonce = waveNonces.get(chunk.index)!;

            await storeContentOnBulletin({
              rpc: parameters.rpc,
              signer: parameters.signer,
              contentBytes: chunk.bytes,
              contentCid: chunk.cid,
              codecValue: CODEC.RAW,
              hashCodeValue: HASH.SHA2_256,
              nonce,
              client: activeClient,
              waitForFinalization,
            });

            manifestState.completedBlocks.set(chunk.index, {
              index: chunk.index,
              cid: chunk.cid,
              length: chunk.length,
            });

            completedChunks += 1;
            parameters.onProgress?.(chunk.index + 1, totalChunks, "stored");
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("wave-timeout")), WAVE_TIMEOUT_MS),
        );

        const waveResult = await Promise.race([wavePromise, timeoutPromise]);

        totalRetries += waveResult.retries;
        await persistManifest(manifestState);
        const endedAtMs = Date.now();
        const durationMs = endedAtMs - startedAtMs;

        const waveSummary: UploadWaveSummary = {
          wave: waveNumber,
          startedAtMs,
          endedAtMs,
          durationMs,
          window,
          attempted: waveChunks.length,
          succeeded: waveChunks.length,
          failed: 0,
          retries: waveResult.retries,
          wasClean: waveResult.retries === 0 && durationMs < CLEAN_WAVE_DURATION_THRESHOLD_MS,
        };

        parameters.onWave?.(waveSummary);
        parameters.onProgress?.(
          (waveChunks[waveChunks.length - 1]?.index ?? 0) + 1,
          totalChunks,
          "wave-complete",
        );

        const windowUpdate = computeNextAdaptiveWindow({
          currentWindow: window,
          maxWindow,
          cleanWaveStreak,
          waveDurationMs: durationMs,
          hadRetryableFailures: waveResult.retryableFailures > 0,
          hadRetries: waveResult.retries > 0,
        });

        cleanWaveStreak = windowUpdate.nextCleanWaveStreak;
        window = windowUpdate.nextWindow;
      } catch (error) {
        const errorMsg = ensureError(error).message.toLowerCase();
        const isStall = errorMsg === "wave-timeout" || errorMsg.includes("store-timeout");
        const isNonceError = errorMsg.includes("stale") || errorMsg.includes("ancientbirthblock");
        const isReconnectRequired = isReconnectRequiredUploadError(error);

        if (isStall || isNonceError || isReconnectRequired) {
          recreateOwnedClient();
          nextNonce = await fetchAccountNonce(parameters.rpc, parameters.accountAddress);
          window = Math.max(ADAPTIVE_WINDOW_MIN, Math.floor(window / 2));
          cleanWaveStreak = 0;

          const unconfirmedChunks = waveChunks.filter(
            (chunk) => !manifestState.completedBlocks.has(chunk.index),
          );
          queue.unshift(...unconfirmedChunks);

          const endedAtMs = Date.now();
          parameters.onWave?.({
            wave: waveNumber,
            startedAtMs,
            endedAtMs,
            durationMs: endedAtMs - startedAtMs,
            window,
            attempted: waveChunks.length,
            succeeded: waveChunks.length - unconfirmedChunks.length,
            failed: unconfirmedChunks.length,
            retries: 0,
            wasClean: false,
          });
          continue;
        }

        const endedAtMs = Date.now();
        parameters.onWave?.({
          wave: waveNumber,
          startedAtMs,
          endedAtMs,
          durationMs: endedAtMs - startedAtMs,
          window,
          attempted: waveChunks.length,
          succeeded: 0,
          failed: waveChunks.length,
          retries: 0,
          wasClean: false,
        });
        throw error;
      } finally {
        emitSchedulerState(0, 0);
      }
    }

    const orderedChunks = buildOrderedStoredChunks(totalChunks, manifestState.completedBlocks);

    parameters.onProgress?.(totalChunks, totalChunks, "building root");

    const blockSizes = orderedChunks.map((chunk) => BigInt(chunk.length));
    const unixfsFileData = new UnixFS({ type: "file", blockSizes });

    const dagPbNode = dagPbModule.prepare({
      Data: unixfsFileData.marshal(),
      Links: orderedChunks.map((chunk) => ({
        Name: "",
        Tsize: chunk.length,
        Hash: CID.parse(chunk.cid),
      })),
    });

    const dagPbBytes = dagPbModule.encode(dagPbNode);
    const rootCidObject = createDagPbCid(dagPbBytes, HASH.SHA2_256);
    const rootCidString = rootCidObject.toString();

    parameters.onProgress?.(totalChunks, totalChunks, "storing root");

    const ROOT_MAX_RETRIES = 5;
    for (let rootAttempt = 1; rootAttempt <= ROOT_MAX_RETRIES; rootAttempt++) {
      try {
        if (rootAttempt > 1) {
          nextNonce = await fetchAccountNonce(parameters.rpc, parameters.accountAddress);
          recreateOwnedClient();
        }
        await storeContentOnBulletin({
          rpc: parameters.rpc,
          signer: parameters.signer,
          contentBytes: dagPbBytes,
          contentCid: rootCidString,
          codecValue: CODEC.DAG_PB,
          hashCodeValue: HASH.SHA2_256,
          nonce: nextNonce,
          client: activeClient,
          storeTimeoutMs: FINAL_STORE_CALL_TIMEOUT_MS,
          waitForFinalization,
        });
        break;
      } catch (rootError) {
        if (rootAttempt === ROOT_MAX_RETRIES) throw rootError;
        const delay = rootAttempt * 2000;
        parameters.onProgress?.(totalChunks, totalChunks, "storing root");
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    manifestState.rootCid = rootCidString;
    await persistManifest(manifestState);
    await deleteManifest(manifestState);

    emitSchedulerState(0, 0);

    return { rootCid: rootCidString };
  } finally {
    if (ownsClient) {
      try {
        activeClient.destroy();
      } catch {
        /* already closed */
      }
    }
  }
}

export async function storeBlockToBulletin(
  parameters: StoreBlockParameters,
): Promise<BulletinStoreResult> {
  return storeContentOnBulletin({
    rpc: parameters.rpc,
    signer: parameters.signer,
    contentBytes: parameters.contentBytes,
    contentCid: parameters.contentCid,
    codecValue: parameters.codecValue,
    hashCodeValue: parameters.hashCodeValue,
    nonce: parameters.nonce,
    client: parameters.client,
    waitForFinalization: parameters.waitForFinalization,
    storeTimeoutMs: parameters.storeTimeoutMs,
  });
}

export type BatchBlock = {
  contentBytes: Uint8Array;
  contentCid: string;
  codecValue: number;
  hashCodeValue: number;
};

export async function storeBatchToBulletin(parameters: {
  signer: Parameters<
    ReturnType<
      ReturnType<PolkadotClient["getTypedApi"]>["tx"]["Utility"]["batch_all"]
    >["signSubmitAndWatch"]
  >[0];
  blocks: BatchBlock[];
  nonce?: number;
  client: PolkadotClient;
  waitForFinalization?: boolean;
  storeTimeoutMs?: number;
}): Promise<{ cids: string[] }> {
  const {
    signer,
    blocks,
    nonce,
    client,
    waitForFinalization = false,
    storeTimeoutMs = STORE_CALL_TIMEOUT_MS,
  } = parameters;

  const typedApi = client.getTypedApi(bulletin);
  const calls = blocks.map(
    (block) =>
      typedApi.tx.TransactionStorage.store_with_cid_config({
        cid: {
          codec: BigInt(block.codecValue),
          hashing: convertHashCodeToEnum(block.hashCodeValue),
        },
        data: Binary.fromBytes(block.contentBytes),
      }).decodedCall,
  );

  const batchTx = typedApi.tx.Utility.batch_all({ calls });
  const txOptions: Record<string, unknown> = {};
  if (nonce !== undefined) txOptions.nonce = nonce;

  const cids = blocks.map((b) => b.contentCid);

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        subscription?.unsubscribe();
      } catch {
        /* */
      }
      reject(new Error("store-timeout"));
    }, storeTimeoutMs);

    function finish(error?: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        subscription?.unsubscribe();
      } catch {
        /* */
      }
      if (error) reject(error);
      else resolve({ cids });
    }

    try {
      subscription = batchTx.signSubmitAndWatch(signer as never, txOptions).subscribe({
        next: (event: any) => {
          if (settled) return;
          if (event.type === "txBestBlocksState" && event.found) {
            if (!waitForFinalization) {
              if (event.ok) finish();
              else
                finish(
                  new Error(
                    event.dispatchError ? formatDispatchError(event.dispatchError) : "Batch failed",
                  ),
                );
            }
          }
          if (event.type === "finalized") {
            if (event.ok) finish();
            else
              finish(
                new Error(
                  event.dispatchError ? formatDispatchError(event.dispatchError) : "Batch failed",
                ),
              );
          }
        },
        error: (err: unknown) => finish(ensureError(err)),
      });
    } catch (err) {
      finish(ensureError(err));
    }
  });
}

export async function fetchAccountNonce(rpc: string, accountAddress: string): Promise<number> {
  const WebSocketConstructor = globalThis.WebSocket ?? (await import("ws")).default;

  return new Promise((resolve, reject) => {
    const websocket = new WebSocketConstructor(rpc);
    const requestId = Date.now();
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        websocket.close();
      } catch {
        /* ignore */
      }
      reject(new Error("nonce-timeout"));
    }, FETCH_NONCE_TIMEOUT_MS);

    const finalize = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    websocket.onopen = () => {
      if (settled) return;
      websocket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "system_accountNextIndex",
          params: [accountAddress],
        }),
      );
    };

    websocket.onmessage = (messageEvent: { data: string | { toString: () => string } }) => {
      try {
        if (settled) return;
        const messageData =
          typeof messageEvent.data === "string" ? messageEvent.data : messageEvent.data.toString();
        const response = JSON.parse(messageData) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };

        if (response.id === requestId) {
          finalize(() => {
            websocket.close();
            if (response.error) {
              reject(new Error(response.error.message || "Failed to fetch account nonce"));
            } else {
              resolve(normalizeRpcNonce(response.result));
            }
          });
        }
      } catch (parseError) {
        finalize(() => {
          websocket.close();
          reject(ensureError(parseError));
        });
      }
    };

    websocket.onerror = () => {
      finalize(() => {
        websocket.close();
        reject(new Error(`WebSocket connection to ${rpc} failed`));
      });
    };
  });
}
