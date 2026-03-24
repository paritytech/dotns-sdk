import chalk from "chalk";
import ora from "ora";
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
import { normalizeUploadMaxRetries, runWithUploadRetries } from "../bulletin/uploadRetry";
import {
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

function logUploadRetry(
  label: string,
  retry: number,
  totalAttempts: number,
  delayMs: number,
  error: unknown,
): void {
  const retryableErrorMessage = formatErrorMessage(error).split("\n")[0] ?? String(error);
  console.log(
    chalk.yellow(
      `  ${label} attempt ${retry + 1}/${totalAttempts} failed: ${retryableErrorMessage}`,
    ),
  );
  console.log(chalk.gray(`  retrying in ${(delayMs / 1000).toFixed(delayMs >= 1000 ? 1 : 0)}s`));
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

async function merkleizeAndUploadDirectory(
  directoryPath: string,
  deps: UploadDeps,
): Promise<MerkleizeDirectoryResult> {
  const WAVE_SIZE = deps.concurrency;
  let waveBuffer: WaveBlock[] = [];
  const sharedClient = createBulletinClient(deps.rpc);
  let completedCount = 0;
  let totalBytes = 0;
  let rootContentCid: CID | undefined;

  const blockCache = new Map<string, Uint8Array>();
  const uploadedCids = new Set<string>();
  let nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);

  async function flushWave(retryCount = 0): Promise<void> {
    if (waveBuffer.length === 0) return;

    const wave = waveBuffer;
    waveBuffer = [];

    const startingNonce = nextNonce;
    nextNonce += wave.length;

    try {
      const wavePromises = wave.map((block, i) =>
        storeBlockToBulletin({
          rpc: deps.rpc,
          signer: deps.signer,
          contentBytes: block.bytes,
          contentCid: block.cid.toString(),
          codecValue: block.cid.code,
          hashCodeValue: block.cid.multihash.code,
          nonce: startingNonce + i,
          client: sharedClient,
          waitForFinalization: deps.waitForFinalization,
        }).then(() => {
          completedCount++;
          totalBytes += block.bytes.length;
          deps.onBlockStored?.(
            {
              cidString: block.cid.toString(),
              codecValue: block.cid.code,
              hashCodeValue: block.cid.multihash.code,
              size: block.bytes.length,
            },
            completedCount,
            completedCount,
          );
        }),
      );

      await Promise.all(wavePromises);

      for (const block of wave) {
        blockCache.delete(block.cid.toString());
      }
    } catch (error) {
      const msg = String(error);
      if ((msg.includes("Stale") || msg.includes("AncientBirthBlock")) && retryCount < 3) {
        nextNonce = await fetchAccountNonce(deps.rpc, deps.accountAddress);
        waveBuffer = wave;
        return flushWave(retryCount + 1);
      }
      throw error;
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

    await flushWave();
  } finally {
    sharedClient.destroy();
    blockCache.clear();
  }

  if (!rootContentCid) {
    throw new Error("Failed to merkleize directory: no root CID produced");
  }

  return { rootCid: rootContentCid, totalBlocks: completedCount, totalBytes };
}

export async function validateAndReadPath(inputPath: string): Promise<ValidatePathResult> {
  const spinner = ora("Validating path").start();

  try {
    const resolvedPath = path.resolve(inputPath);
    const pathStats = await filesystem.stat(resolvedPath);

    if (pathStats.isDirectory()) {
      spinner.succeed("Directory validated");
      return { bytes: new Uint8Array(), isDirectory: true, resolvedPath };
    }

    if (pathStats.isFile()) {
      if (pathStats.size > MAX_SINGLE_UPLOAD_SIZE_BYTES) {
        spinner.succeed("File validated (deferred read)");
        return {
          bytes: new Uint8Array(),
          isDirectory: false,
          resolvedPath,
          fileSize: pathStats.size,
          fileMtimeMs: pathStats.mtimeMs,
          deferredRead: true,
        };
      }

      spinner.text = "Reading file";
      const fileBytes = new Uint8Array(await filesystem.readFile(resolvedPath));
      spinner.succeed("File validated");
      return {
        bytes: fileBytes,
        isDirectory: false,
        resolvedPath,
        fileSize: pathStats.size,
        fileMtimeMs: pathStats.mtimeMs,
      };
    }

    spinner.fail("Path validation failed");
    throw new Error(`Path is neither a file nor a directory: ${resolvedPath}`);
  } catch (error) {
    spinner.fail("Path validation failed");
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
  } = options;

  const spinner = ora("Checking authorization status").start();
  let client: PolkadotClient | undefined;
  let txHash = "";

  try {
    const existingAuthorization = await checkAuthorization(rpc, targetAddress);

    if (existingAuthorization.authorized) {
      const existingTransactions = existingAuthorization.transactions ?? 0;
      const existingBytes = existingAuthorization.bytes ?? BigInt(0);
      const currentBlock = existingAuthorization.currentBlock ?? 0;

      if (existingAuthorization.expired) {
        spinner.warn("Authorization expired");
        console.log(
          chalk.gray("  expired:  ") +
            chalk.red(formatExpirationDisplay(currentBlock, existingAuthorization.expiration!)),
        );
        spinner.start("Re-authorizing account");
      } else if (existingTransactions >= transactions && existingBytes >= bytes) {
        if (!force) {
          spinner.warn("Account already authorized");
          console.log(
            chalk.gray("  transactions: ") +
              chalk.white(existingTransactions.toLocaleString()) +
              chalk.gray(` (requested: ${transactions.toLocaleString()})`),
          );
          console.log(
            chalk.gray("  bytes:        ") +
              chalk.white(formatBytes(existingBytes)) +
              chalk.gray(` (requested: ${formatBytes(bytes)})`),
          );
          console.log(
            chalk.gray("  expires:      ") +
              chalk.white(formatExpirationDisplay(currentBlock, existingAuthorization.expiration!)),
          );
          return { txHash: "", blockHash: "" };
        }
        spinner.info("Force re-authorizing account");
      } else {
        spinner.info("Upgrading authorization limits");
        console.log(
          chalk.gray("  transactions: ") +
            chalk.white(
              `${existingTransactions.toLocaleString()} → ${transactions.toLocaleString()}`,
            ),
        );
        console.log(
          chalk.gray("  bytes:        ") +
            chalk.white(`${formatBytes(existingBytes)} → ${formatBytes(bytes)}`),
        );
      }
    } else {
      spinner.text = "Authorizing account";
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
              spinner.text = "Authorization: signing";
              break;
            case "broadcasted":
              spinner.text = "Authorization: broadcasting";
              txHash = event.txHash;
              break;
            case "txBestBlocksState":
              if (event.found) {
                spinner.text = "Authorization: included, awaiting finalization";
              }
              break;
            case "finalized":
              subscription.unsubscribe();
              client?.destroy();

              if (!event.ok) {
                spinner.fail("Authorization transaction failed on-chain");
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
                    spinner.succeed("Account authorized");
                    console.log(chalk.gray("  target:       ") + chalk.cyan(targetAddress));
                    console.log(
                      chalk.gray("  transactions: ") + chalk.white(transactions.toLocaleString()),
                    );
                    console.log(chalk.gray("  bytes:        ") + chalk.white(formatBytes(bytes)));
                    console.log(
                      chalk.gray("  expires:      ") +
                        chalk.white(
                          formatExpirationDisplay(
                            verification.currentBlock ?? 0,
                            verification.expiration!,
                          ),
                        ),
                    );
                    resolve({ txHash, blockHash: event.block.hash });
                  } else {
                    spinner.fail("Authorization not applied");
                    reject(
                      new Error(
                        "Authorization was finalized but not applied.\n" +
                          "The signer may not have Authorizer privileges on this chain.",
                      ),
                    );
                  }
                })
                .catch(() => {
                  spinner.warn("Authorization submitted (could not verify)");
                  resolve({ txHash, blockHash: event.block.hash });
                });
              break;
          }
        },
        error: (error) => {
          subscription.unsubscribe();
          client?.destroy();
          spinner.fail("Authorization failed");
          reject(error);
        },
      });
    });
  } catch (error) {
    client?.destroy();
    spinner.fail("Authorization failed");

    const errorMessage = formatErrorMessage(error);

    if (errorMessage.includes("AlreadyAuthorized")) {
      console.log(chalk.yellow("  Account is already authorized"));
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
  const maxRetries = normalizeUploadMaxRetries(options.maxRetries);

  try {
    return await runWithUploadRetries({
      maxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        logUploadRetry("upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        const spinner = ora(
          attempt === 0
            ? "Storing to Bulletin"
            : `Retrying upload (${attempt + 1}/${totalAttempts})`,
        ).start();

        try {
          const storeResult = await storeSingleFileToBulletin({
            rpc: bulletinRpc,
            signer,
            contentBytes: fileBytes,
            onProgress: (status) => {
              spinner.text = `Storing: ${status}`;
            },
            waitForFinalization: false,
          });

          spinner.succeed("Stored");

          const verifySpinner = ora("Connecting to Bulletin P2P...").start();
          const verificationResult = await verifySingleFileCid(storeResult.cid);
          if (verificationResult.resolvable) {
            verifySpinner.succeed(`CID verified via ${verificationResult.gateway}`);
          } else {
            verifySpinner.warn("Could not verify CID");
          }

          return storeResult.cid;
        } catch (error) {
          if (attempt < maxRetries) {
            spinner.warn("Upload attempt failed");
          } else {
            spinner.fail("Upload failed");
          }
          throw error;
        }
      },
    });
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("Payment")) {
      console.log(chalk.red("\n  Account is not authorized for TransactionStorage."));
      console.log(chalk.yellow("\n  To authorize your account, run:\n"));
      console.log(chalk.gray("    dotns bulletin authorize <your-address>\n"));
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
  const effectiveChunkSize = clampChunkSizeBytes(chunkSizeBytes);
  const totalChunks = Math.ceil(fileSize / effectiveChunkSize);
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 4));
  const maxRetries = normalizeUploadMaxRetries(options.maxRetries);
  let completedBlocks = cloneCompletedBlocks(options.completedBlocks);

  try {
    return await runWithUploadRetries({
      maxRetries,
      onRetry: ({ retry, totalAttempts, delayMs, error }) => {
        logUploadRetry("chunked upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        if (attempt > 0) {
          completedBlocks = await loadCompletedBlocksForRetry(
            filePath,
            fileSize,
            effectiveChunkSize,
            completedBlocks,
          );
        }

        console.log(
          chalk.gray("  chunks:   ") +
            chalk.white(`${totalChunks} (adaptive window 1..${concurrency})`),
        );

        if (attempt > 0 && completedBlocks && completedBlocks.size > 0) {
          console.log(
            chalk.yellow(
              `  resume:   ${completedBlocks.size}/${totalChunks} chunks already uploaded`,
            ),
          );
        }

        const startTime = Date.now();
        let completedCount = 0;
        let waveStartTime = 0;
        let spinner = ora(
          attempt === 0
            ? "Waiting for first wave..."
            : `Resuming upload (${attempt + 1}/${totalAttempts})...`,
        ).start();

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
              if (status === "uploading-wave") {
                waveStartTime = Date.now();
                spinner.text = `Uploading wave starting at chunk ${currentChunk}/${totalChunkCount}...`;
                return;
              }

              if (status === "stored") {
                completedCount++;
                const elapsed = (Date.now() - startTime) / 1000;
                const bytesUploaded = Math.min(fileSize, completedCount * effectiveChunkSize);
                const throughput = elapsed > 0 ? bytesUploaded / elapsed : 0;
                const remaining = throughput > 0 ? (fileSize - bytesUploaded) / throughput : 0;
                const pct = Math.round((completedCount / totalChunks) * 100);

                if (completedCount % concurrency === 0 || completedCount === totalChunks) {
                  const waveMs = Date.now() - waveStartTime;
                  const waveMessage = `Wave complete — ${completedCount}/${totalChunks} chunks (${(waveMs / 1000).toFixed(1)}s)`;
                  spinner.succeed(waveMessage);
                  if (process.env.CI) {
                    console.log(`[upload] ${waveMessage} | ${pct}% | ${formatBytes(throughput)}/s`);
                  }
                  spinner = ora(
                    `${pct}% | ${formatBytes(throughput)}/s | ETA ${formatDuration(remaining)}`,
                  ).start();
                }
                return;
              }

              if (status === "skipped") {
                completedCount++;
                return;
              }

              spinner.text = `${status} (${currentChunk}/${totalChunkCount})`;
            },
          });

          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = elapsed > 0 ? fileSize / elapsed : 0;
          spinner.succeed(
            `Uploaded ${totalChunks} chunks (${formatBytes(fileSize)}) in ${formatDuration(elapsed)} — ${formatBytes(throughput)}/s`,
          );
          return storeResult.rootCid;
        } catch (error) {
          if (attempt < maxRetries) {
            spinner.warn("Upload attempt failed");
          } else {
            spinner.fail("Upload failed");
          }
          throw error;
        }
      },
    });
  } catch (error) {
    const errorMessage = formatErrorMessage(error);
    if (errorMessage.includes("Payment")) {
      console.log(chalk.red("\n  Account is not authorized for TransactionStorage."));
      console.log(chalk.yellow("\n  To authorize your account, run:\n"));
      console.log(chalk.gray("    dotns bulletin authorize <your-address> --key-uri //Alice\n"));
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
        logUploadRetry("directory upload", retry, totalAttempts, delayMs, error);
      },
      execute: async (attempt, totalAttempts) => {
        const startTime = Date.now();
        let uploadedBytes = 0;
        let spinner = ora(
          attempt === 0
            ? "Merkleizing and uploading directory"
            : `Retrying directory upload (${attempt + 1}/${totalAttempts})`,
        ).start();

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
                  const waveMessage = `Wave complete — ${completedCount} blocks uploaded (${formatBytes(throughput)}/s)`;
                  spinner.succeed(waveMessage);
                  if (process.env.CI) {
                    console.log(`[upload] ${waveMessage}`);
                  }
                  spinner = ora("Merkleizing + uploading...").start();
                } else {
                  spinner.text = `Block ${completedCount} stored (${meta.cidString.slice(0, 12)}...)`;
                }
              },
            },
          );

          const elapsed = (Date.now() - startTime) / 1000;
          const throughput = elapsed > 0 ? totalBytes / elapsed : 0;
          spinner.succeed(
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

          const verifySpinner = ora("Verifying content resolution").start();
          const rootCidString = rootCid.toString();

          const rootVerification = await verifyCidResolution(rootCidString, verificationGateway);

          if (rootVerification.resolvable) {
            verifySpinner.succeed("Root CID resolvable");
          } else {
            verifySpinner.warn("Root CID not yet resolvable");
            console.log(chalk.gray("  gateway:  ") + chalk.white(verificationGateway));
            console.log(chalk.yellow("  Content may take time to propagate through the network"));
          }

          return { storageCid: rootCidString, ipfsCid: rootCidString };
        } catch (error) {
          if (attempt < normalizedMaxRetries) {
            spinner.warn("Directory upload attempt failed");
          } else {
            spinner.fail("Directory upload failed");
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
