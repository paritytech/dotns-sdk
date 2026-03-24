import chalk from "chalk";
import { promises as filesystem, createReadStream } from "node:fs";
import path from "node:path";
import type { PolkadotClient, PolkadotSigner } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { bulletin } from "@polkadot-api/descriptors";
import { importer } from "ipfs-unixfs-importer";
import type { CID } from "multiformats/cid";
import { encodeIpfsContenthash } from "../bulletin/cid";
import {
  hasIpfsCli,
  merkleizeWithIpfs,
  verifyCidResolution,
  verifySingleFileCid,
} from "../bulletin/ipfs";
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
  AuthorizationState,
  WaveBlock,
  BulletinPhaseHandler,
  BulletinRetryHandler,
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

type BlockMetadata = {
  cidString: string;
  codecValue: number;
  hashCodeValue: number;
  size: number;
};

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

type UploadDeps = {
  rpc: string;
  signer: PolkadotSigner;
  accountAddress: string;
  concurrency: number;
  waitForFinalization: boolean;
  onBlockStored?: (meta: BlockMetadata, completedCount: number, totalSoFar: number) => void;
};

const DIRECTORY_WAVE_RETRY_BASE_DELAYS_MS = [200, 400, 800] as const;
const MAX_DIRECTORY_WAVE_RETRIES = 3;

async function merkleizeAndUploadDirectory(
  directoryPath: string,
  deps: UploadDeps,
): Promise<MerkleizeDirectoryResult> {
  const WAVE_SIZE = deps.concurrency;
  let waveBuffer: WaveBlock[] = [];
  let sharedClient = createBulletinClient(deps.rpc);
  let completedCount = 0;
  let totalBytes = 0;
  let rootContentCid: CID | undefined;

  const blockCache = new Map<string, Uint8Array>();
  const uploadedCids = new Set<string>();
  let nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);

  const recreateSharedClient = () => {
    try {
      sharedClient.destroy();
    } catch {
      /* already closed */
    }
    sharedClient = createBulletinClient(deps.rpc);
  };

  async function flushWave(options: { isFinalWave?: boolean } = {}): Promise<void> {
    if (waveBuffer.length === 0) return;

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
              client: sharedClient,
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
    sharedClient.destroy();
    blockCache.clear();
  }

  if (!rootContentCid) {
    throw new Error("Failed to merkleize directory: no root CID produced");
  }

  return { rootCid: rootContentCid, totalBlocks: completedCount, totalBytes };
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
  } catch {
    return { authorized: false };
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

          if (hasIpfsCli()) {
            try {
              const ipfsCliResult = merkleizeWithIpfs(directoryPath);
              if (ipfsCliResult.cid !== rootCid.toString()) {
                console.log(chalk.yellow("  CID mismatch: IPFS CLI vs local merkleization"));
                console.log(chalk.red("  IPFS CLI: ") + chalk.white(ipfsCliResult.cid));
                console.log(chalk.red("  Local:    ") + chalk.white(rootCid.toString()));
              }
            } catch {
              // IPFS CLI verification is optional
            }
          }

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
