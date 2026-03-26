import chalk from "chalk";
import { promises as filesystem, createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PolkadotClient, PolkadotSigner } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";
import { importer } from "ipfs-unixfs-importer";
import type { CID } from "multiformats/cid";
import { encodeIpfsContenthash } from "../bulletin/cid";
import { verifyCidResolution, verifySingleFileCid } from "../bulletin/ipfs";
import { completedBlocksFromManifest, loadManifestForResume } from "../bulletin/uploadManifest";
import {
  isRetryableUploadError,
  normalizeUploadMaxRetries,
  runWithUploadRetries,
} from "../bulletin/uploadRetry";
import {
  FINAL_STORE_CALL_TIMEOUT_MS,
  storeSingleFileToBulletin,
  storeChunkedFileToBulletin,
  fetchAccountNonce,
  createBulletinClient,
  storeBlockToBulletin,
  clampChunkSizeBytes,
} from "../bulletin/store";
import type {
  ValidatePathResult,
  AuthorizeAccountOptions,
  AuthorizeAccountResult,
  AuthorizationStatus,
  StoreDirectoryOptions,
  StoreDirectoryResult,
  UploadChunkedBlocksOptions,
  UploadManifestCompletedBlock,
  UploadSingleBlockOptions,
  MerkleizeDirectoryResult,
  MerkleizeCollectResult,
  CollectedBlock,
  CarUploadWithDhtOptions,
  AuthorizationState,
  WaveBlock,
  BulletinPhaseHandler,
  BulletinRetryHandler,
  UploadDeps,
  FlushWaveOptions,
} from "../types/types";
import {
  DEFAULT_AUTHORIZATION_TRANSACTIONS,
  DEFAULT_AUTHORIZATION_BYTES,
  DEFAULT_VERIFICATION_GATEWAY,
  BULLETIN_BLOCK_TIME_MS,
  DEFAULT_UPLOAD_MAX_RETRIES,
  MAX_SINGLE_UPLOAD_SIZE_BYTES,
} from "../utils/constants";
import { formatErrorMessage, formatBytes, formatDuration } from "../utils/formatting";

function emitPhase(
  onPhase: BulletinPhaseHandler | undefined,
  phase: "validate" | "authorize" | "upload" | "verify",
  state: "start" | "update" | "success" | "warning" | "failure",
  message: string,
): void {
  onPhase?.({ phase, state, message });
}

function emitRetry(
  onRetry: BulletinRetryHandler | undefined,
  label: string,
  retry: number,
  totalAttempts: number,
  delayMs: number,
  error: unknown,
): void {
  onRetry?.({
    label,
    retry,
    totalAttempts,
    delayMs,
    errorMessage: formatErrorMessage(error).split("\n")[0] ?? String(error),
  });
}

function cloneCompletedBlocks(
  completedBlocks?: Map<number, UploadManifestCompletedBlock>,
): Map<number, UploadManifestCompletedBlock> | undefined {
  if (!completedBlocks || completedBlocks.size === 0) {
    return undefined;
  }

  return new Map(
    [...completedBlocks.entries()].map(([index, block]) => [
      index,
      { index: block.index, cid: block.cid, length: block.length },
    ]),
  );
}

async function loadCompletedBlocksForRetry(
  filePath: string,
  fileSize: number,
  chunkSize: number,
  existingBlocks?: Map<number, UploadManifestCompletedBlock>,
): Promise<Map<number, UploadManifestCompletedBlock> | undefined> {
  const fileStats = await filesystem.stat(filePath);
  const mergedCompletedBlocks = cloneCompletedBlocks(existingBlocks) ?? new Map();
  const manifestLoadResult = await loadManifestForResume({
    inputPath: filePath,
    fileSize,
    fileMtimeMs: fileStats.mtimeMs,
    chunkSize,
  });

  if (manifestLoadResult.manifest) {
    for (const [index, block] of completedBlocksFromManifest(manifestLoadResult.manifest)) {
      mergedCompletedBlocks.set(index, block);
    }
  }

  return mergedCompletedBlocks.size > 0 ? mergedCompletedBlocks : undefined;
}

export function estimateBlockDate(currentBlock: number, targetBlock: number): Date {
  const blockDelta = targetBlock - currentBlock;
  return new Date(Date.now() + blockDelta * BULLETIN_BLOCK_TIME_MS);
}

export function formatEstimatedDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export function formatExpirationDisplay(currentBlock: number, expirationBlock: number): string {
  return `~${formatEstimatedDate(estimateBlockDate(currentBlock, expirationBlock))}`;
}

export function expirationToISOString(
  currentBlock: number | undefined,
  expirationBlock: number | undefined,
): string | null {
  if (currentBlock === undefined || expirationBlock === undefined) return null;
  return estimateBlockDate(currentBlock, expirationBlock).toISOString();
}

async function* traverseDirectoryRecursively(
  directoryPath: string,
): AsyncGenerator<{ path: string; fullPath: string }> {
  const directoryEntries = await filesystem.readdir(directoryPath, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const fullPath = path.join(directoryPath, entry.name);
    const relativePath = entry.name;

    if (entry.isDirectory()) {
      for await (const nestedFile of traverseDirectoryRecursively(fullPath)) {
        yield { path: `${relativePath}/${nestedFile.path}`, fullPath: nestedFile.fullPath };
      }
    } else if (entry.isFile()) {
      yield { path: relativePath, fullPath };
    }
  }
}

const DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS = [200, 400, 800] as const;
const MAX_DIRECTORY_WAVE_RETRIES = 3;

async function merkleizeAndUploadDirectory(
  directoryPath: string,
  deps: UploadDeps,
): Promise<MerkleizeDirectoryResult> {
  const WAVE_SIZE = deps.concurrency;
  let waveBuffer: WaveBlock[] = [];
  let sharedClient: ReturnType<typeof createBulletinClient> | null = null;
  let completedCount = 0;
  let totalBytes = 0;
  let rootContentCid: CID | undefined;

  const blockCache = new Map<string, Uint8Array>();
  const uploadedCids = new Set<string>();
  let nextNonce = 0;
  let nonceReady: Promise<void> | null = null;

  const ensureClient = async () => {
    if (!nonceReady) {
      nonceReady = (async () => {
        sharedClient = createBulletinClient(deps.rpc);
        nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);
      })();
    }
    await nonceReady;
    return sharedClient!;
  };

  const recreateSharedClient = () => {
    try {
      sharedClient?.destroy();
    } catch {
      /* already closed */
    }
    sharedClient = createBulletinClient(deps.rpc);
    nonceReady = Promise.resolve();
  };

  async function flushWave(options: FlushWaveOptions = {}): Promise<void> {
    if (waveBuffer.length === 0) return;

    await ensureClient();

    const wave = waveBuffer;
    waveBuffer = [];
    let pendingBlocks = wave;
    let retryCount = 0;
    const storeTimeoutMs = options.isFinalWave ? FINAL_STORE_CALL_TIMEOUT_MS : undefined;

    while (pendingBlocks.length > 0) {
      const startingNonce = nextNonce;
      nextNonce += pendingBlocks.length;

      const results = await Promise.all(
        pendingBlocks.map(async (block, index) => {
          try {
            await storeBlockToBulletin({
              rpc: deps.rpc,
              signer: deps.signer,
              contentBytes: block.bytes,
              contentCid: block.cid.toString(),
              codecValue: block.cid.code,
              hashCodeValue: block.cid.multihash.code,
              nonce: startingNonce + index,
              client: sharedClient!,
              storeTimeoutMs,
              waitForFinalization: deps.waitForFinalization,
            });

            return { block, error: null };
          } catch (error) {
            return { block, error };
          }
        }),
      );

      const retryableFailures: WaveBlock[] = [];

      for (const result of results) {
        if (!result.error) {
          completedCount++;
          totalBytes += result.block.bytes.length;
          deps.onBlockStored?.(
            {
              cidString: result.block.cid.toString(),
              codecValue: result.block.cid.code,
              hashCodeValue: result.block.cid.multihash.code,
              size: result.block.bytes.length,
            },
            completedCount,
            completedCount,
          );
          continue;
        }

        if (!isRetryableUploadError(result.error) || retryCount >= MAX_DIRECTORY_WAVE_RETRIES) {
          throw result.error;
        }

        retryableFailures.push(result.block);
      }

      if (retryableFailures.length === 0) {
        for (const block of wave) {
          blockCache.delete(block.cid.toString());
        }
        return;
      }

      const delayMs =
        DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS[
          Math.min(retryCount, DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS.length - 1)
        ] ?? DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS[DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS.length - 1];

      retryCount += 1;
      recreateSharedClient();
      nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);
      pendingBlocks = retryableFailures;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const uploadingBlockstore = {
    put: async (contentCid: CID, contentBytes: Uint8Array): Promise<CID> => {
      const cidStr = contentCid.toString();

      if (uploadedCids.has(cidStr)) {
        return contentCid;
      }

      blockCache.set(cidStr, contentBytes);
      waveBuffer.push({ cid: contentCid, bytes: contentBytes });
      uploadedCids.add(cidStr);

      if (waveBuffer.length >= WAVE_SIZE) {
        await flushWave();
      }

      return contentCid;
    },
    get: async (contentCid: CID): Promise<Uint8Array> => {
      const cached = blockCache.get(contentCid.toString());
      if (!cached) {
        throw new Error(`Block not found: ${contentCid}`);
      }
      return cached;
    },
  };

  async function* importerSource() {
    for await (const file of traverseDirectoryRecursively(directoryPath)) {
      yield { path: file.path, content: createReadStream(file.fullPath) };
    }
  }

  try {
    for await (const importedEntry of importer(importerSource(), uploadingBlockstore, {
      wrapWithDirectory: true,
      cidVersion: 1,
      rawLeaves: true,
    })) {
      rootContentCid = importedEntry.cid;
    }

    recreateSharedClient();
    nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);
    await flushWave({ isFinalWave: true });
  } finally {
    if (sharedClient) (sharedClient as ReturnType<typeof createBulletinClient>).destroy();
    blockCache.clear();
  }

  if (!rootContentCid) {
    throw new Error("Failed to merkleize directory: no root CID produced");
  }

  return { rootCid: rootContentCid, totalBlocks: completedCount, totalBytes };
}

const CAR_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_CAR_IN_FLIGHT_BYTES = 8 * 1024 * 1024;

export async function merkleizeDirectoryToBlocks(
  directoryPath: string,
): Promise<MerkleizeCollectResult> {
  const blocks: CollectedBlock[] = [];
  const blockCache = new Map<string, Uint8Array>();
  let rootContentCid: CID | undefined;
  let totalBytes = 0;

  const collectingBlockstore = {
    put: async (contentCid: CID, contentBytes: Uint8Array): Promise<CID> => {
      const cidStr = contentCid.toString();
      if (!blockCache.has(cidStr)) {
        blockCache.set(cidStr, contentBytes);
        blocks.push({ cid: contentCid, bytes: contentBytes });
        totalBytes += contentBytes.length;
      }
      return contentCid;
    },
    get: async (contentCid: CID): Promise<Uint8Array> => {
      const cached = blockCache.get(contentCid.toString());
      if (!cached) throw new Error(`Block not found: ${contentCid}`);
      return cached;
    },
  };

  async function* importerSource() {
    for await (const file of traverseDirectoryRecursively(directoryPath)) {
      yield { path: file.path, content: createReadStream(file.fullPath) };
    }
  }

  for await (const importedEntry of importer(importerSource(), collectingBlockstore, {
    wrapWithDirectory: true,
    cidVersion: 1,
    rawLeaves: true,
  })) {
    rootContentCid = importedEntry.cid;
  }

  blockCache.clear();

  if (!rootContentCid) {
    throw new Error("Failed to merkleize directory: no root CID produced");
  }

  return { rootCid: rootContentCid, blocks, totalBytes };
}

export function chunkCarBytes(carBytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < carBytes.length; offset += chunkSize) {
    chunks.push(carBytes.subarray(offset, Math.min(offset + chunkSize, carBytes.length)));
  }
  return chunks;
}

export function countCarChunks(totalBytes: number, chunkSize: number): number {
  if (totalBytes <= 0) return 0;
  return Math.ceil(totalBytes / chunkSize);
}

export function getCarChunkLength(totalBytes: number, chunkIndex: number, chunkSize: number): number {
  const offset = chunkIndex * chunkSize;
  if (offset >= totalBytes) return 0;
  return Math.min(chunkSize, totalBytes - offset);
}

export async function readCarChunk(
  handle: Awaited<ReturnType<typeof filesystem.open>>,
  totalBytes: number,
  chunkIndex: number,
  chunkSize: number,
): Promise<Uint8Array> {
  const length = getCarChunkLength(totalBytes, chunkIndex, chunkSize);
  if (length <= 0) {
    throw new Error(`CAR chunk ${chunkIndex + 1} is out of range`);
  }

  const buffer = Buffer.allocUnsafe(length);
  const offset = chunkIndex * chunkSize;
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  if (bytesRead !== length) {
    throw new Error(
      `Failed to read CAR chunk ${chunkIndex + 1}: expected ${length} bytes, read ${bytesRead}`,
    );
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, length);
}

export function clampCarWaveSize(requestedConcurrency: number): number {
  const byBudget = Math.max(1, Math.floor(MAX_CAR_IN_FLIGHT_BYTES / CAR_CHUNK_SIZE_BYTES));
  return Math.max(1, Math.min(requestedConcurrency, byBudget));
}

export function getPendingCarChunkIndexes(
  totalCarChunks: number,
  completedChunkIndexes: Set<number>,
): number[] {
  return Array.from({ length: totalCarChunks }, (_, index) => index).filter(
    (index) => !completedChunkIndexes.has(index),
  );
}

export function applyCarUploadWaveResults(
  waveChunks: Array<{ index: number; bytes: Uint8Array }>,
  results: PromiseSettledResult<number>[],
  completedChunkIndexes: Set<number>,
): unknown | null {
  let firstFailure: unknown | null = null;

  for (const [resultIndex, result] of results.entries()) {
    if (result.status === "fulfilled") {
      completedChunkIndexes.add(result.value);
    } else if (!firstFailure) {
      firstFailure = result.reason;
    }

    waveChunks[resultIndex]!.bytes = new Uint8Array();
  }

  return firstFailure;
}

export async function storeDirectoryAsCar(
  bulletinRpc: string,
  signer: PolkadotSigner,
  directoryPath: string,
  options: CarUploadWithDhtOptions = { accountAddress: "" },
): Promise<StoreDirectoryResult> {
  const {
    concurrency = 3,
    accountAddress,
    onPhase,
    onRetry,
    maxRetries = DEFAULT_UPLOAD_MAX_RETRIES,
    waitForFinalization = false,
    daemonTtlSeconds = 0,
  } = options;

  if (!accountAddress) {
    throw new Error("accountAddress is required for directory uploads");
  }

  const {
    hasIpfsCli,
    addDirectoryToIpfs,
    exportCidToCar,
    provideRootCid,
    addDirectoryWithDaemon,
  } = await import("../bulletin/ipfs");

  if (!hasIpfsCli()) {
    throw new Error(
      "Kubo (ipfs) is required for --as-car directory uploads. " +
        "Install from: https://docs.ipfs.tech/install/",
    );
  }

  const normalizedMaxRetries = normalizeUploadMaxRetries(maxRetries);

  emitPhase(onPhase, "upload", "start", "Merkleizing directory via Kubo");

  const addResult = addDirectoryToIpfs(directoryPath);
  if (!addResult.success || !addResult.output) {
    throw new Error(`Kubo merkleization failed: ${addResult.error ?? "unknown error"}`);
  }

  const ipfsCidString = addResult.output.trim();
  emitPhase(onPhase, "upload", "update", `Kubo root CID: ${ipfsCidString}`);

  emitPhase(onPhase, "upload", "update", "Exporting DAG to CAR via Kubo");

  const tmpCarPath = path.join(os.tmpdir(), `dotns-${Date.now()}.car`);
  const exportResult = exportCidToCar(ipfsCidString, tmpCarPath);
  if (!exportResult.success) {
    throw new Error(`Kubo CAR export failed: ${exportResult.error ?? "unknown error"}`);
  }

  const carStats = await filesystem.stat(tmpCarPath);
  const carSizeBytes = carStats.size;
  const totalCarChunks = countCarChunks(carSizeBytes, CAR_CHUNK_SIZE_BYTES);
  const requestedWaveSize = Math.max(1, Math.floor(concurrency));
  const effectiveWaveSize = clampCarWaveSize(requestedWaveSize);

  emitPhase(
    onPhase,
    "upload",
    "update",
    `CAR exported: ${formatBytes(carSizeBytes)}, ${totalCarChunks} chunk(s)`,
  );

  if (effectiveWaveSize !== requestedWaveSize) {
    emitPhase(
      onPhase,
      "upload",
      "warning",
      `Clamped CAR upload concurrency from ${requestedWaveSize} to ${effectiveWaveSize} to keep in-flight memory within ${formatBytes(MAX_CAR_IN_FLIGHT_BYTES)}`,
    );
  }

  const { createRawCid, CODEC, HASH } = await import("../bulletin/cid");

  const startTime = Date.now();
  const completedChunkIndexes = new Set<number>();

  try {
    await runWithUploadRetries({
      maxRetries: normalizedMaxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        emitRetry(onRetry, "CAR chunk upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        const remainingChunkIndexes = getPendingCarChunkIndexes(
          totalCarChunks,
          completedChunkIndexes,
        );

        emitPhase(
          onPhase,
          "upload",
          attempt === 0 ? "start" : "update",
          attempt === 0
            ? `Uploading ${totalCarChunks} CAR chunk(s) to Bulletin`
            : `Retrying CAR upload (${attempt + 1}/${totalAttempts}) — ${completedChunkIndexes.size}/${totalCarChunks} chunks already stored`,
        );

        if (remainingChunkIndexes.length === 0) {
          return ipfsCidString;
        }

        const sharedClient = createBulletinClient(bulletinRpc);
        const carHandle = await filesystem.open(tmpCarPath, "r");
        let nextNonce = await fetchAccountNonce(bulletinRpc, accountAddress);

        try {
          for (let i = 0; i < remainingChunkIndexes.length; i += effectiveWaveSize) {
            const waveIndexes = remainingChunkIndexes.slice(i, i + effectiveWaveSize);
            const waveChunks = await Promise.all(
              waveIndexes.map(async (chunkIndex) => ({
                index: chunkIndex,
                bytes: await readCarChunk(
                  carHandle,
                  carSizeBytes,
                  chunkIndex,
                  CAR_CHUNK_SIZE_BYTES,
                ),
              })),
            );

            const waveStartNonce = nextNonce;
            nextNonce += waveChunks.length;

            const results = await Promise.allSettled(
              waveChunks.map(async (chunk, waveIndex) => {
                const chunkCid = createRawCid(chunk.bytes, HASH.SHA2_256);
                await storeBlockToBulletin({
                  rpc: bulletinRpc,
                  signer,
                  contentBytes: chunk.bytes,
                  contentCid: chunkCid.toString(),
                  codecValue: CODEC.RAW,
                  hashCodeValue: HASH.SHA2_256,
                  nonce: waveStartNonce + waveIndex,
                  client: sharedClient,
                  storeTimeoutMs: undefined,
                  waitForFinalization,
                });

                return chunk.index;
              }),
            );

            const firstFailure = applyCarUploadWaveResults(
              waveChunks,
              results,
              completedChunkIndexes,
            );

            emitPhase(
              onPhase,
              "upload",
              "update",
              `Uploaded ${completedChunkIndexes.size}/${totalCarChunks} CAR chunks`,
            );

            if (firstFailure) {
              throw firstFailure;
            }
          }

          return ipfsCidString;
        } finally {
          await carHandle.close();
          sharedClient.destroy();
        }
      },
    });

    const elapsed = (Date.now() - startTime) / 1000;
    emitPhase(
      onPhase,
      "upload",
      "success",
      `CAR uploaded in ${formatDuration(elapsed)} — ${formatBytes(carSizeBytes / Math.max(1, elapsed))}/s`,
    );

    emitPhase(onPhase, "upload", "update", "Announcing directory to IPFS network via Kubo");

    const daemonResult = await addDirectoryWithDaemon(directoryPath, daemonTtlSeconds);
    if (daemonResult.success) {
      let daemonMsg: string;
      if (!daemonResult.daemonStarted) {
        daemonMsg = "Directory pinned and providing via existing Kubo daemon";
      } else if (daemonTtlSeconds > 0) {
        daemonMsg = `Directory pinned and providing via Kubo (daemon auto-stops in ${daemonTtlSeconds}s)`;
      } else {
        daemonMsg =
          "Directory pinned and providing via Kubo (daemon running — leave it for content to stay reachable)";
      }
      emitPhase(onPhase, "upload", "success", daemonMsg);
    } else {
      provideRootCid(ipfsCidString);
      emitPhase(
        onPhase,
        "upload",
        "warning",
        `Kubo daemon failed: ${daemonResult.error ?? "unknown"}. Content is pinned but may not be reachable. Run 'ipfs daemon' to provide.`,
      );
    }

    return { storageCid: ipfsCidString, ipfsCid: ipfsCidString };
  } finally {
    try {
      await filesystem.unlink(tmpCarPath);
    } catch {
      /* cleanup best-effort */
    }
  }
}

export async function validateAndReadPath(
  inputPath: string,
  onPhase?: BulletinPhaseHandler,
): Promise<ValidatePathResult> {
  emitPhase(onPhase, "validate", "start", "Validating path");
  try {
    const resolvedPath = path.resolve(inputPath);
    const pathStats = await filesystem.stat(resolvedPath);

    if (pathStats.isDirectory()) {
      emitPhase(onPhase, "validate", "success", "Directory validated");
      return { bytes: new Uint8Array(), isDirectory: true, resolvedPath };
    }

    if (pathStats.isFile()) {
      if (pathStats.size > MAX_SINGLE_UPLOAD_SIZE_BYTES) {
        emitPhase(onPhase, "validate", "success", "File validated (deferred read)");
        return {
          bytes: new Uint8Array(),
          isDirectory: false,
          resolvedPath,
          fileSize: pathStats.size,
          fileMtimeMs: pathStats.mtimeMs,
          deferredRead: true,
        };
      }

      emitPhase(onPhase, "validate", "update", "Reading file");
      const fileBytes = new Uint8Array(await filesystem.readFile(resolvedPath));
      emitPhase(onPhase, "validate", "success", "File validated");
      return {
        bytes: fileBytes,
        isDirectory: false,
        resolvedPath,
        fileSize: pathStats.size,
        fileMtimeMs: pathStats.mtimeMs,
      };
    }

    emitPhase(onPhase, "validate", "failure", "Path validation failed");
    throw new Error(`Path is neither a file nor a directory: ${resolvedPath}`);
  } catch (error) {
    emitPhase(onPhase, "validate", "failure", "Path validation failed");
    throw error;
  }
}

export async function authorizeAccount(
  options: AuthorizeAccountOptions,
): Promise<AuthorizeAccountResult> {
  const {
    rpc,
    signer,
    targetAddress,
    transactions = DEFAULT_AUTHORIZATION_TRANSACTIONS,
    bytes = DEFAULT_AUTHORIZATION_BYTES,
    force = false,
    onPhase,
  } = options;
  let client: PolkadotClient | undefined;
  let txHash = "";
  emitPhase(onPhase, "authorize", "start", "Checking authorization status");

  try {
    const existingAuthorization = await checkAuthorization(rpc, targetAddress);

    if (existingAuthorization.authorized) {
      const existingTransactions = existingAuthorization.transactions ?? 0;
      const existingBytes = existingAuthorization.bytes ?? BigInt(0);

      if (existingAuthorization.expired) {
        emitPhase(onPhase, "authorize", "warning", "Authorization expired");
        emitPhase(onPhase, "authorize", "update", "Re-authorizing account");
      } else if (existingTransactions >= transactions && existingBytes >= bytes) {
        if (!force) {
          emitPhase(onPhase, "authorize", "warning", "Account already authorized");
          return { txHash: "", blockHash: "" };
        }
        emitPhase(onPhase, "authorize", "update", "Force re-authorizing account");
      } else {
        emitPhase(onPhase, "authorize", "update", "Upgrading authorization limits");
      }
    } else {
      emitPhase(onPhase, "authorize", "update", "Authorizing account");
    }

    client = createClient(withPolkadotSdkCompat(getWsProvider(rpc)));
    const typedApi = client.getTypedApi(bulletin);

    const authTransaction = typedApi.tx.TransactionStorage.authorize_account({
      who: targetAddress,
      transactions,
      bytes,
    });

    return await new Promise<AuthorizeAccountResult>((resolve, reject) => {
      const subscription = authTransaction.signSubmitAndWatch(signer).subscribe({
        next: (event) => {
          switch (event.type) {
            case "signed":
              emitPhase(onPhase, "authorize", "update", "Authorization: signing");
              break;
            case "broadcasted":
              emitPhase(onPhase, "authorize", "update", "Authorization: broadcasting");
              txHash = event.txHash;
              break;
            case "txBestBlocksState":
              if (event.found) {
                emitPhase(
                  onPhase,
                  "authorize",
                  "update",
                  "Authorization: included, awaiting finalization",
                );
              }
              break;
            case "finalized":
              subscription.unsubscribe();
              client?.destroy();

              if (!event.ok) {
                emitPhase(onPhase, "authorize", "failure", "Authorization transaction failed");
                reject(new Error("Authorization transaction was rejected by the chain"));
                return;
              }

              checkAuthorization(rpc, targetAddress)
                .then((verification) => {
                  if (
                    verification.authorized &&
                    !verification.expired &&
                    (verification.transactions ?? 0) >= transactions &&
                    (verification.bytes ?? BigInt(0)) >= bytes
                  ) {
                    emitPhase(onPhase, "authorize", "success", "Account authorized");
                    resolve({ txHash, blockHash: event.block.hash });
                  } else {
                    emitPhase(onPhase, "authorize", "failure", "Authorization not applied");
                    reject(
                      new Error(
                        "Authorization was finalized but not applied.\n" +
                          "The signer may not have Authorizer privileges on this chain.",
                      ),
                    );
                  }
                })
                .catch(() => {
                  emitPhase(
                    onPhase,
                    "authorize",
                    "warning",
                    "Authorization submitted (could not verify)",
                  );
                  resolve({ txHash, blockHash: event.block.hash });
                });
              break;
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          client?.destroy();
          emitPhase(onPhase, "authorize", "failure", "Authorization failed");
          reject(error);
        },
      });
    });
  } catch (error) {
    client?.destroy();
    emitPhase(onPhase, "authorize", "failure", "Authorization failed");

    const errorMessage = formatErrorMessage(error);

    if (errorMessage.includes("AlreadyAuthorized")) {
      emitPhase(onPhase, "authorize", "warning", "Account already authorized");
      return { txHash: "", blockHash: "" };
    }

    if (errorMessage.includes("BadOrigin")) {
      throw new Error("Authorization failed: The signer does not have Authorizer privileges.");
    }

    throw error;
  }
}

export async function checkAuthorization(
  rpc: string,
  accountAddress: string,
): Promise<AuthorizationStatus> {
  const client = createClient(withPolkadotSdkCompat(getWsProvider(rpc)));

  try {
    const typedApi = client.getTypedApi(bulletin);
    const [authorizationState, currentBlock] = await Promise.all([
      typedApi.query.TransactionStorage.Authorizations.getValue({
        type: "Account",
        value: accountAddress,
      }),
      typedApi.query.System.Number.getValue(),
    ]);

    if (authorizationState) {
      const expiration = authorizationState.expiration;
      const expired = currentBlock >= expiration;

      return {
        authorized: true,
        transactions: authorizationState.extent.transactions,
        bytes: authorizationState.extent.bytes,
        expiration,
        currentBlock,
        expired,
      };
    }

    return { authorized: false, currentBlock };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { authorized: false, errorMessage: message };
  } finally {
    client.destroy();
  }
}

export async function ensureAccountAuthorized(
  bulletinRpc: string,
  accountAddress: string,
): Promise<AuthorizationState> {
  const authStatus = await checkAuthorization(bulletinRpc, accountAddress);

  if (authStatus.authorized && !authStatus.expired) {
    return { expiration: authStatus.expiration, currentBlock: authStatus.currentBlock };
  }

  if (authStatus.authorized && authStatus.expired) {
    throw new Error(
      `Account authorization has expired (${formatExpirationDisplay(authStatus.currentBlock ?? 0, authStatus.expiration!)}).\n` +
        `Re-authorize it:\n\n` +
        `  dotns bulletin authorize ${accountAddress}\n`,
    );
  }

  throw new Error(
    `Account is not authorized for Bulletin TransactionStorage.\n` +
      `Authorize it first:\n\n` +
      `  dotns bulletin authorize ${accountAddress}\n`,
  );
}

export async function uploadSingleBlock(
  bulletinRpc: string,
  signer: PolkadotSigner,
  fileBytes: Uint8Array,
  options: UploadSingleBlockOptions = {},
): Promise<string> {
  const { onPhase, onRetry } = options;
  const maxRetries = normalizeUploadMaxRetries(options.maxRetries);

  try {
    return await runWithUploadRetries({
      maxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        emitRetry(onRetry, "upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        emitPhase(
          onPhase,
          "upload",
          "start",
          attempt === 0
            ? "Storing to Bulletin"
            : `Retrying upload (${attempt + 1}/${totalAttempts})`,
        );

        try {
          const storeResult = await storeSingleFileToBulletin({
            rpc: bulletinRpc,
            signer,
            contentBytes: fileBytes,
            onProgress: (status) => {
              emitPhase(onPhase, "upload", "update", `Storing: ${status}`);
            },
            waitForFinalization: false,
          });

          emitPhase(onPhase, "upload", "success", "Stored");

          emitPhase(onPhase, "verify", "start", "Connecting to Bulletin P2P");
          const verificationResult = await verifySingleFileCid(storeResult.cid);
          if (verificationResult.resolvable) {
            emitPhase(
              onPhase,
              "verify",
              "success",
              `CID verified via ${verificationResult.gateway}`,
            );
          } else {
            emitPhase(onPhase, "verify", "warning", "Could not verify CID");
          }

          return storeResult.cid;
        } catch (error) {
          if (attempt < maxRetries) {
            emitPhase(onPhase, "upload", "warning", "Upload attempt failed");
          } else {
            emitPhase(onPhase, "upload", "failure", "Upload failed");
          }
          throw error;
        }
      },
    });
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("Payment")) {
      throw new Error(
        "Account is not authorized for TransactionStorage.\n\n" +
          "Authorize it first:\n\n" +
          "  dotns bulletin authorize <your-address>\n",
      );
    }

    throw error;
  }
}

export async function uploadChunkedBlocks(
  bulletinRpc: string,
  signer: PolkadotSigner,
  filePath: string,
  chunkSizeBytes: number,
  fileSize: number,
  accountAddress: string,
  options: UploadChunkedBlocksOptions = {},
): Promise<string> {
  const { onPhase, onRetry } = options;
  const effectiveChunkSize = clampChunkSizeBytes(chunkSizeBytes);
  const totalChunks = Math.ceil(fileSize / effectiveChunkSize);
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 4));
  const maxRetries = normalizeUploadMaxRetries(options.maxRetries);
  let completedBlocks = cloneCompletedBlocks(options.completedBlocks);

  try {
    return await runWithUploadRetries({
      maxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        emitRetry(onRetry, "chunked upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt) => {
        if (attempt > 0) {
          completedBlocks = await loadCompletedBlocksForRetry(
            filePath,
            fileSize,
            effectiveChunkSize,
            completedBlocks,
          );
        }
        emitPhase(
          onPhase,
          "upload",
          "start",
          `Chunked upload starting (${totalChunks} chunks, adaptive window 1..${concurrency})`,
        );

        if (attempt > 0 && completedBlocks && completedBlocks.size > 0) {
          emitPhase(
            onPhase,
            "upload",
            "update",
            `Resuming from ${completedBlocks.size}/${totalChunks} uploaded chunks`,
          );
        }

        const startTime = Date.now();

        try {
          const storeResult = await storeChunkedFileToBulletin({
            rpc: bulletinRpc,
            signer,
            filePath,
            chunkSize: effectiveChunkSize,
            fileSize,
            accountAddress,
            concurrency,
            completedBlocks,
            onSchedulerState: options.onSchedulerState,
            onWave: options.onWave,
            waitForFinalization: false,
            onProgress: (currentChunk, totalChunkCount, status) => {
              if (status === "stored" || status === "skipped") return;
              emitPhase(
                onPhase,
                "upload",
                "update",
                `${status} (${currentChunk}/${totalChunkCount})`,
              );
            },
          });

          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = elapsed > 0 ? fileSize / elapsed : 0;
          emitPhase(
            onPhase,
            "upload",
            "success",
            `Uploaded ${totalChunks} chunks (${formatBytes(fileSize)}) in ${formatDuration(elapsed)} — ${formatBytes(throughput)}/s`,
          );
          return storeResult.rootCid;
        } catch (error) {
          if (attempt < maxRetries) {
            emitPhase(onPhase, "upload", "warning", "Upload attempt failed");
          } else {
            emitPhase(onPhase, "upload", "failure", "Upload failed");
          }
          throw error;
        }
      },
    });
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("Payment")) {
      throw new Error(
        "Account is not authorized for TransactionStorage.\n\n" +
          "Authorize it first:\n\n" +
          `  dotns bulletin authorize ${accountAddress}\n`,
      );
    }

    throw error;
  }
}

export async function storeDirectory(
  bulletinRpc: string,
  signer: PolkadotSigner,
  directoryPath: string,
  options: StoreDirectoryOptions = {},
): Promise<StoreDirectoryResult> {
  const {
    concurrency = 3,
    accountAddress,
    onPhase,
    onRetry,
    verificationGateway = DEFAULT_VERIFICATION_GATEWAY,
    maxRetries = DEFAULT_UPLOAD_MAX_RETRIES,
    waitForFinalization = true,
  } = options;

  if (!accountAddress) {
    throw new Error("accountAddress is required for directory uploads");
  }

  const normalizedMaxRetries = normalizeUploadMaxRetries(maxRetries);

  try {
    return await runWithUploadRetries({
      maxRetries: normalizedMaxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        emitRetry(onRetry, "directory upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        const startTime = Date.now();
        let uploadedBytes = 0;
        emitPhase(
          onPhase,
          "upload",
          "start",
          attempt === 0
            ? "Merkleizing and uploading directory"
            : `Retrying directory upload (${attempt + 1}/${totalAttempts})`,
        );

        try {
          const { rootCid, totalBlocks, totalBytes } = await merkleizeAndUploadDirectory(
            directoryPath,
            {
              rpc: bulletinRpc,
              signer,
              accountAddress,
              concurrency,
              waitForFinalization,
              onBlockStored: (meta, completedCount) => {
                uploadedBytes += meta.size;
                const elapsed = (Date.now() - startTime) / 1000;
                const throughput = elapsed > 0 ? uploadedBytes / elapsed : 0;

                if (completedCount % concurrency === 0) {
                  emitPhase(
                    onPhase,
                    "upload",
                    "update",
                    `Wave complete — ${completedCount} blocks uploaded (${formatBytes(throughput)}/s)`,
                  );
                }
              },
            },
          );

          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = elapsed > 0 ? totalBytes / elapsed : 0;
          emitPhase(
            onPhase,
            "upload",
            "success",
            `Uploaded ${totalBlocks} blocks (${formatBytes(totalBytes)}) in ${formatDuration(elapsed)} — ${formatBytes(throughput)}/s`,
          );

          console.log(chalk.gray("  root cid: ") + chalk.cyan(rootCid.toString()));

          emitPhase(onPhase, "verify", "start", "Verifying content resolution");
          const rootCidString = rootCid.toString();

          const rootVerification = await verifyCidResolution(rootCidString, verificationGateway);

          if (rootVerification.resolvable) {
            emitPhase(onPhase, "verify", "success", "Root CID resolvable");
          } else {
            emitPhase(onPhase, "verify", "warning", "Root CID not yet resolvable");
            console.log(chalk.gray("  gateway:  ") + chalk.white(verificationGateway));
            console.log(chalk.yellow("  Content may take time to propagate through the network"));
          }

          return { storageCid: rootCidString, ipfsCid: rootCidString };
        } catch (error) {
          if (attempt < normalizedMaxRetries) {
            emitPhase(onPhase, "upload", "warning", "Directory upload attempt failed");
          } else {
            emitPhase(onPhase, "upload", "failure", "Directory upload failed");
          }
          throw error;
        }
      },
    });
  } catch (error) {
    throw error;
  }
}

export { verifySingleFileCid } from "../bulletin/ipfs";

export function generateContenthash(contentCid: string): string {
  return encodeIpfsContenthash(contentCid);
}
