import { Command } from "commander";
import chalk from "chalk";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import v8 from "node:v8";
import { promises as filesystem } from "node:fs";
import type {
  BulletinUploadOptions,
  CommandOptions,
  UploadProfileReport,
  UploadProfileSample,
  UploadSchedulerState,
  UploadWaveSummary,
} from "../../types/types";
import { formatErrorMessage, formatBytes, formatDuration } from "../../utils/formatting";
import {
  validateAndReadPath,
  uploadSingleBlock,
  uploadChunkedBlocks,
  storeDirectory,
  generateContenthash,
  ensureAccountAuthorized,
  authorizeAccount,
  checkAuthorization,
  formatExpirationDisplay,
  expirationToISOString,
} from "../../commands/bulletin";
import {
  addUploadRecord,
  readHistory,
  removeUploadRecord,
  clearHistory,
  getHistoryPath,
  formatRecordTimestamp,
  getPreviewUrl,
} from "../../bulletin/cidHistory";
import {
  completedBlocksFromManifest,
  cleanupStaleManifests,
  deleteManifest,
  loadManifestForResume,
} from "../../bulletin/uploadManifest";
import { normalizeUploadMaxRetries } from "../../bulletin/uploadRetry";
import { addAuthOptions } from "./authOptions";
import { prepareContext } from "../context";
import {
  DEFAULT_BULLETIN_RPC,
  DEFAULT_CHUNK_SIZE_BYTES,
  DEFAULT_UPLOAD_MAX_RETRIES,
  DEFAULT_SUDO_KEY_URI,
  DEFAULT_AUTHORIZATION_TRANSACTIONS,
  DEFAULT_AUTHORIZATION_BYTES,
  MAX_SINGLE_UPLOAD_SIZE_BYTES,
} from "../../utils/constants";
import { getJsonFlag } from "./lookup";
import { clampChunkSizeBytes } from "../../bulletin/store";

function getMergedOptions(
  command: Command | undefined,
  fallback: BulletinUploadOptions,
): CommandOptions & BulletinUploadOptions {
  const mergedOptions: any = { ...(fallback ?? {}) };

  let currentCommand: Command | null | undefined = command?.parent;
  while (currentCommand) {
    if (typeof currentCommand.opts === "function") {
      const parentOptions = currentCommand.opts();
      for (const key in parentOptions) {
        if (!(key in mergedOptions) && parentOptions[key] !== undefined) {
          mergedOptions[key] = parentOptions[key];
        }
      }
    }
    currentCommand = currentCommand.parent;
  }

  return mergedOptions;
}


export type UploadProfiler = {
  onSchedulerState: (state: UploadSchedulerState) => void;
  onWave: (wave: UploadWaveSummary) => void;
  finalize: (
    finalCid: string,
    overrideOutputPath?: string,
  ) => Promise<{ report: UploadProfileReport; outputPath: string }>;
};

export type UploadProfilerOptions = {
  sourcePath: string;
  sourceSizeBytes: number;
  chunkSizeBytes: number;
  rpc: string;
  initialConcurrency: number;
  maxConcurrency: number;
  outputPath?: string;
  jsonOutput: boolean;
};

const PROFILE_SAMPLE_INTERVAL_MS = 2_000;

export function createProfileFingerprint(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function buildDefaultProfileOutputPath(sourcePath: string, fingerprint: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = path.basename(sourcePath).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(
    os.homedir(),
    ".dotns",
    "upload-profiles",
    `${timestamp}-${basename}-${fingerprint}.json`,
  );
}

export function createUploadProfiler(options: UploadProfilerOptions): UploadProfiler {
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  let latestSchedulerState: UploadSchedulerState = {
    timestampMs: startedAtMs,
    window: Math.max(1, options.initialConcurrency),
    inFlightBytes: 0,
    inFlightChunks: 0,
    completedChunks: 0,
    retries: 0,
  };
  const samples: UploadProfileSample[] = [];
  const waves: UploadWaveSummary[] = [];

  const captureSample = () => {
    const usage = process.memoryUsage();
    samples.push({
      timestampMs: Date.now(),
      heapUsed: usage.heapUsed,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers,
      external: usage.external,
      inFlightBytes: latestSchedulerState.inFlightBytes,
      inFlightChunks: latestSchedulerState.inFlightChunks,
      window: latestSchedulerState.window,
      completed: latestSchedulerState.completedChunks,
      retries: latestSchedulerState.retries,
    });
  };

  captureSample();
  const timer = setInterval(captureSample, PROFILE_SAMPLE_INTERVAL_MS);
  timer.unref?.();

  const summarizeAndWrite = async (
    finalCid: string,
    overrideOutputPath?: string,
  ): Promise<{ report: UploadProfileReport; outputPath: string }> => {
    clearInterval(timer);
    captureSample();

    const finishedAtMs = Date.now();
    const finishedAtIso = new Date(finishedAtMs).toISOString();
    const totalUploadTimeMs = Math.max(1, finishedAtMs - startedAtMs);
    const throughputBytesPerSecond = (options.sourceSizeBytes / totalUploadTimeMs) * 1000;
    const peakHeapUsed = Math.max(...samples.map((sample) => sample.heapUsed));
    const peakRss = Math.max(...samples.map((sample) => sample.rss));
    const peakArrayBuffers = Math.max(...samples.map((sample) => sample.arrayBuffers));
    const peakExternal = Math.max(...samples.map((sample) => sample.external));
    const maxWindowReached = Math.max(...samples.map((sample) => sample.window));

    const report: UploadProfileReport = {
      meta: {
        sourcePath: options.sourcePath,
        sourceSizeBytes: options.sourceSizeBytes,
        chunkSizeBytes: options.chunkSizeBytes,
        rpc: options.rpc,
        startedAtIso,
        finishedAtIso,
        heapLimitBytes: v8.getHeapStatistics().heap_size_limit,
        initialConcurrency: options.initialConcurrency,
        maxConcurrency: options.maxConcurrency,
      },
      samples,
      waves,
      summary: {
        totalUploadTimeMs,
        totalUploadTimeSeconds: totalUploadTimeMs / 1000,
        elapsedMs: totalUploadTimeMs,
        throughputBytesPerSecond,
        peakHeapUsed,
        peakRss,
        peakArrayBuffers,
        peakExternal,
        retryCount: latestSchedulerState.retries,
        maxWindowReached,
        finalCid,
      },
    };

    const outputPath =
      overrideOutputPath ??
      options.outputPath ??
      buildDefaultProfileOutputPath(
        options.sourcePath,
        createProfileFingerprint(
          `${options.sourcePath}:${options.sourceSizeBytes}:${options.chunkSizeBytes}:${startedAtIso}`,
        ),
      );

    const resolvedOutputPath = path.resolve(outputPath);
    await filesystem.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await filesystem.writeFile(resolvedOutputPath, JSON.stringify(report, null, 2), "utf8");

    return { report, outputPath: resolvedOutputPath };
  };

  return {
    onSchedulerState: (state: UploadSchedulerState) => {
      latestSchedulerState = state;
      captureSample();
    },
    onWave: (wave: UploadWaveSummary) => {
      waves.push(wave);
      captureSample();
      if (!options.jsonOutput) {
        const seconds = (wave.durationMs / 1000).toFixed(1);
        console.log(
          chalk.gray(
            `  wave #${wave.wave}: ${seconds}s | window=${wave.window} | retries=${wave.retries}`,
          ),
        );
      }
    },
    finalize: summarizeAndWrite,
  };
}

export async function withCapturedConsole<T>(callback: () => Promise<T>): Promise<T> {
  const MAX_CAPTURED_ENTRIES = 400;
  const captured: string[] = [];
  const pushCaptured = (value: string) => {
    captured.push(value);
    if (captured.length > MAX_CAPTURED_ENTRIES) {
      captured.splice(0, captured.length - MAX_CAPTURED_ENTRIES);
    }
  };
  const capture = (...args: any[]) => {
    pushCaptured(args.map(String).join(" "));
  };
  const captureWrite = (chunk: any) => {
    pushCaptured(String(chunk));
    return true;
  };

  const saved = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    stdoutWrite: process.stdout.write.bind(process.stdout),
    stderrWrite: process.stderr.write.bind(process.stderr),
  };

  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;
  process.stdout.write = captureWrite as any;
  process.stderr.write = captureWrite as any;

  try {
    return await callback();
  } catch (error) {
    saved.error("[captured output before failure]\n" + captured.join("\n"));
    throw error;
  } finally {
    console.log = saved.log;
    console.error = saved.error;
    console.warn = saved.warn;
    console.info = saved.info;
    process.stdout.write = saved.stdoutWrite;
    process.stderr.write = saved.stderrWrite;
  }
}

export function maybeQuiet<T>(jsonOutput: boolean, callback: () => Promise<T>): Promise<T> {
  return jsonOutput ? withCapturedConsole(callback) : callback();
}

async function resolveTargetAddress(
  positionalAddress: string | undefined,
  mergedOptions: any,
  jsonOutput: boolean,
): Promise<string> {
  if (positionalAddress) return positionalAddress;
  const context = await maybeQuiet(jsonOutput, () =>
    prepareContext({ ...mergedOptions, useBulletin: true }),
  );
  return context.substrateAddress;
}

export function attachBulletinCommands(root: Command): void {
  const bulletinCommand = root
    .command("bulletin")
    .description("Bulletin storage utilities")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(bulletinCommand);
  const authorizeCommand = bulletinCommand
    .command("authorize [address]")
    .description("Authorize an account for Bulletin TransactionStorage")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option(
      "--transactions <count>",
      "Number of transactions to authorize",
      String(DEFAULT_AUTHORIZATION_TRANSACTIONS),
    )
    .option("--bytes <count>", "Number of bytes to authorize", String(DEFAULT_AUTHORIZATION_BYTES))
    .option("--force", "Force re-authorization even if account appears already authorized", false)
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(authorizeCommand).action(
    async (positionalAddress: string | undefined, options: any, command: any) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const transactions = Number(
          mergedOptions.transactions || DEFAULT_AUTHORIZATION_TRANSACTIONS,
        );
        const bytes = BigInt(mergedOptions.bytes || DEFAULT_AUTHORIZATION_BYTES);
        const force = Boolean(options.force);
        const signerKeyUri = String(mergedOptions.keyUri || DEFAULT_SUDO_KEY_URI);

        const targetAddress = await resolveTargetAddress(
          positionalAddress,
          mergedOptions,
          jsonOutput,
        );

        const signerContext = await withCapturedConsole(() =>
          prepareContext({ keyUri: signerKeyUri, useBulletin: true }),
        );

        if (!jsonOutput) {
          console.log(chalk.blue("\n▶ Bulletin Authorize"));
          console.log(chalk.gray("  target:       ") + chalk.cyan(targetAddress));
          console.log(chalk.gray("  rpc:          ") + chalk.white(bulletinRpc));
          console.log(chalk.gray("  transactions: ") + chalk.white(transactions.toLocaleString()));
          console.log(chalk.gray("  bytes:        ") + chalk.white(formatBytes(bytes)));
          console.log(chalk.gray("  signer:       ") + chalk.yellow(signerKeyUri));
        }

        await maybeQuiet(jsonOutput, () =>
          authorizeAccount({
            rpc: bulletinRpc,
            signer: signerContext.signer,
            targetAddress,
            transactions,
            bytes,
            force,
          }),
        );

        if (jsonOutput) {
          const authStatus = await checkAuthorization(bulletinRpc, targetAddress);
          const expiresAt = expirationToISOString(authStatus.currentBlock, authStatus.expiration);
          console.log(
            JSON.stringify({
              ok: true,
              target: targetAddress,
              rpc: bulletinRpc,
              transactions,
              bytes: bytes.toString(),
              expiresAt,
            }),
          );
        } else {
          console.log(chalk.green("\n✓ Authorization Complete"));
          console.log(chalk.gray("  The account can now upload to Bulletin.\n"));
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(command);

        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }

        if (errorMessage.includes("AlreadyAuthorized")) {
          console.log(chalk.yellow("\n⚠ Account is already authorized\n"));
          process.exit(0);
        }

        if (errorMessage.includes("BadOrigin")) {
          console.error(chalk.red("\n✗ Authorization failed — insufficient privileges"));
          console.error(
            chalk.yellow("  The signer does not have Authorizer privileges on this chain."),
          );
          console.error(chalk.gray("  Override with --key-uri if needed.\n"));
          process.exit(1);
        }

        if (errorMessage.includes("not applied")) {
          console.error(chalk.red(`\n✗ ${errorMessage}`));
          console.error(chalk.gray("  Override with --key-uri if needed.\n"));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  const uploadCommand = bulletinCommand
    .command("upload <path>")
    .description("Upload a file or directory to Bulletin and print the resulting CID")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option(
      "--chunk-size <bytes>",
      "Chunk size for large uploads",
      String(DEFAULT_CHUNK_SIZE_BYTES),
    )
    .option(
      "--max-retries <n>",
      "Retry transient upload failures (default: 5, capped at 20)",
      String(DEFAULT_UPLOAD_MAX_RETRIES),
    )
    .option("--force-chunked", "Force chunked upload (DAG-PB)", false)
    .option("--concurrency <n>", "Adaptive scheduler max window (default: 4)", "4")
    .option("--print-contenthash", "Also print 0x-prefixed IPFS contenthash for the CID", false)
    .option("--resume", "Resume a previously interrupted upload", false)
    .option("--profile-upload", "Enable upload profiling and write a JSON report", false)
    .option("--profile-output <path>", "Path to write upload profiling JSON report")
    .option("--no-history", "Do not save upload to history", true)
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(uploadCommand).action(
    async (
      inputPath: string,
      options: BulletinUploadOptions & { history?: boolean },
      command: any,
    ) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        await cleanupStaleManifests();

        const validatedPath = await maybeQuiet(jsonOutput, () =>
          validateAndReadPath(inputPath),
        );
        const { bytes, isDirectory, resolvedPath, deferredRead, fileSize, fileMtimeMs } =
          validatedPath;

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const chunkSizeBytes = clampChunkSizeBytes(
          Number(mergedOptions.chunkSize || DEFAULT_CHUNK_SIZE_BYTES),
        );
        const maxRetries = normalizeUploadMaxRetries(mergedOptions.maxRetries);
        const concurrency = Math.max(
          1,
          Math.min(4, Math.floor(Number(mergedOptions.concurrency || 4))),
        );
        const resume = Boolean(mergedOptions.resume);
        const profileUpload = Boolean(mergedOptions.profileUpload);

        const shouldUseChunkedUpload =
          !isDirectory &&
          (deferredRead || mergedOptions.forceChunked || bytes.length > MAX_SINGLE_UPLOAD_SIZE_BYTES);
        const effectiveFileSize = isDirectory ? 0 : fileSize ?? bytes.length;

        let resumedBlocks: ReturnType<typeof completedBlocksFromManifest> | undefined;
        if (resume && shouldUseChunkedUpload) {
          const resolvedFileMtimeMs =
            fileMtimeMs ?? (await filesystem.stat(resolvedPath)).mtimeMs;
          const manifestLoadResult = await loadManifestForResume({
            inputPath: resolvedPath,
            fileSize: effectiveFileSize,
            fileMtimeMs: resolvedFileMtimeMs,
            chunkSize: chunkSizeBytes,
          });

          if (manifestLoadResult.manifest && manifestLoadResult.manifest.completedBlocks.length > 0) {
            resumedBlocks = completedBlocksFromManifest(manifestLoadResult.manifest);
            if (!jsonOutput) {
              console.log(
                chalk.yellow(
                  `  resuming: ${manifestLoadResult.manifest.completedBlocks.length} blocks already uploaded`,
                ),
              );
            }
          } else if (manifestLoadResult.staleManifest) {
            if (!jsonOutput) {
              console.log(
                chalk.yellow(
                  "  resume notice: file fingerprint changed, starting a fresh upload manifest",
                ),
              );
            }
            await deleteManifest(manifestLoadResult.staleManifest);
          }
        }

        const context = await maybeQuiet(jsonOutput, () =>
          prepareContext({ ...mergedOptions, useBulletin: true }),
        );

        const authInfo = await maybeQuiet(jsonOutput, () =>
          ensureAccountAuthorized(bulletinRpc, context.signer, context.substrateAddress),
        );

        const profileOutputOverride = mergedOptions.profileOutput
          ? String(mergedOptions.profileOutput)
          : undefined;
        const profiler =
          profileUpload
            ? createUploadProfiler({
                sourcePath: resolvedPath,
                sourceSizeBytes: effectiveFileSize,
                chunkSizeBytes: shouldUseChunkedUpload ? chunkSizeBytes : Math.max(1, effectiveFileSize),
                rpc: bulletinRpc,
                initialConcurrency: shouldUseChunkedUpload ? 1 : 1,
                maxConcurrency: shouldUseChunkedUpload ? concurrency : 1,
                outputPath: profileOutputOverride,
                jsonOutput,
              })
            : undefined;

        const performUpload = async () => {
          if (isDirectory) {
            const result = await storeDirectory(bulletinRpc, context.signer, resolvedPath, {
              concurrency,
              accountAddress: context.substrateAddress,
              maxRetries,
              waitForFinalization: false,
            });
            return { cid: result.storageCid, ipfsCid: result.ipfsCid, size: 0 };
          }

          if (shouldUseChunkedUpload) {
            const result = await uploadChunkedBlocks(
              bulletinRpc,
              context.signer,
              resolvedPath,
              chunkSizeBytes,
              effectiveFileSize,
              context.substrateAddress,
              {
                completedBlocks: resumedBlocks,
                concurrency,
                maxRetries,
                onSchedulerState: profiler?.onSchedulerState,
                onWave: profiler?.onWave,
              },
            );
            return { cid: result, ipfsCid: result, size: effectiveFileSize };
          }

          const result = await uploadSingleBlock(bulletinRpc, context.signer, bytes, {
            maxRetries,
          });
          return { cid: result, ipfsCid: result, size: bytes.length };
        };

        let cid: string;
        let ipfsCid: string;
        let uploadSize: number;
        let profileReportPath: string | undefined;
        let profileReport: UploadProfileReport | undefined;
        const uploadStartedAtMs = Date.now();
        const uploadStartedAtIso = new Date(uploadStartedAtMs).toISOString();

        if (jsonOutput) {
          const uploadResult = await withCapturedConsole(performUpload);
          cid = uploadResult.cid;
          ipfsCid = uploadResult.ipfsCid;
          uploadSize = uploadResult.size;
        } else {
          const pathBasename = resolvedPath.split("/").pop() ?? resolvedPath;

          if (authInfo?.expiration && authInfo.currentBlock) {
            console.log(
              chalk.gray("  auth:     ") +
                chalk.white(
                  `valid (expires ${formatExpirationDisplay(authInfo.currentBlock, authInfo.expiration)})`,
                ),
            );
          }

          if (isDirectory) {
            console.log(chalk.blue(`\n▶ Uploading directory: ${pathBasename}`));
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(chalk.gray("  concurrency: ") + chalk.white(`${concurrency}x parallel waves`));
          } else if (shouldUseChunkedUpload) {
            const effectiveSize = fileSize ?? bytes.length;
            const totalChunks = Math.ceil(effectiveSize / chunkSizeBytes);
            console.log(chalk.blue(`\n▶ Uploading file: ${pathBasename} (${formatBytes(effectiveSize)})`));
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(
              chalk.gray("  mode:        ") +
                chalk.white(
                  `chunked (${totalChunks} × ${formatBytes(chunkSizeBytes)}, adaptive window 1..${concurrency})`,
                ),
            );
          } else {
            console.log(chalk.blue(`\n▶ Uploading file: ${pathBasename} (${formatBytes(bytes.length)})`));
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(chalk.gray("  mode:        ") + chalk.white("single block"));
          }

          const uploadResult = await performUpload();
          cid = uploadResult.cid;
          ipfsCid = uploadResult.ipfsCid;
          uploadSize = uploadResult.size;
        }

        const uploadFinishedAtMs = Date.now();
        const uploadFinishedAtIso = new Date(uploadFinishedAtMs).toISOString();
        const totalUploadTimeMs = Math.max(1, uploadFinishedAtMs - uploadStartedAtMs);
        const totalUploadTimeSeconds = totalUploadTimeMs / 1000;

        if (profiler) {
          const finalizedProfile = await profiler.finalize(cid, profileOutputOverride);
          profileReport = finalizedProfile.report;
          profileReportPath = finalizedProfile.outputPath;
        }

        const contenthash = generateContenthash(cid);

        const previewUrl = getPreviewUrl({
          cid,
          ipfsCid,
          path: resolvedPath,
          type: (isDirectory ? "directory" : "file") as "directory" | "file",
          size: uploadSize,
          timestamp: "",
        });

        if (jsonOutput) {
          const authExpiresAt = expirationToISOString(authInfo?.currentBlock, authInfo?.expiration);
          console.log(
            JSON.stringify({
              cid: ipfsCid,
              contenthash,
              preview: previewUrl,
              path: resolvedPath,
              type: isDirectory ? "directory" : "file",
              size: uploadSize,
              authorizationExpiresAt: authExpiresAt,
              uploadStartedAtIso,
              uploadFinishedAtIso,
              totalUploadTimeMs,
              totalUploadTimeSeconds,
            }),
          );
        } else {
          console.log(chalk.gray("\n  cid:         ") + chalk.cyan(ipfsCid));
          console.log(chalk.gray("  preview:     ") + chalk.blue(previewUrl));
          console.log(
            chalk.gray("  total time:  ") + chalk.white(formatDuration(totalUploadTimeSeconds)),
          );

          if (mergedOptions.printContenthash) {
            console.log(chalk.gray("  contenthash: ") + chalk.white(`0x${contenthash}`));
          }

          if (profileReportPath && profileReport) {
            console.log(chalk.gray("  profile:     ") + chalk.white(profileReportPath));
            console.log(
              chalk.gray("  throughput:  ") +
                chalk.white(
                  `${formatBytes(profileReport.summary.throughputBytesPerSecond)}/s`,
                ),
            );
            console.log(
              chalk.gray("  peak heap:   ") +
                chalk.white(formatBytes(profileReport.summary.peakHeapUsed)),
            );
          }

          console.log(chalk.green("\n✓ Upload Complete\n"));
        }

        if (mergedOptions.history !== false) {
          await addUploadRecord({
            cid,
            ipfsCid,
            path: resolvedPath,
            type: isDirectory ? "directory" : "file",
            size: uploadSize,
          });
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(command);

        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
          process.exit(1);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  const statusCommand = bulletinCommand
    .command("status [address]")
    .description("Check authorization status for an account on Bulletin")
    .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  addAuthOptions(statusCommand).action(
    async (positionalAddress: string | undefined, options: any, command: any) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);
        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);

        const targetAddress = await resolveTargetAddress(
          positionalAddress,
          mergedOptions,
          jsonOutput,
        );

        const authStatus = await checkAuthorization(bulletinRpc, targetAddress);

        if (jsonOutput) {
          console.log(
            JSON.stringify({
              address: targetAddress,
              rpc: bulletinRpc,
              authorized: authStatus.authorized,
              expired: authStatus.expired ?? false,
              transactions: authStatus.transactions ?? 0,
              bytes: (authStatus.bytes ?? BigInt(0)).toString(),
              expiresAt: expirationToISOString(authStatus.currentBlock, authStatus.expiration),
            }),
          );
        } else {
          console.log(chalk.blue("\n▶ Bulletin Authorization Status"));
          console.log(chalk.gray("  account:      ") + chalk.cyan(targetAddress));
          console.log(chalk.gray("  rpc:          ") + chalk.white(bulletinRpc));

          if (!authStatus.authorized) {
            console.log(chalk.gray("  status:       ") + chalk.red("not authorized"));
            console.log(
              chalk.gray("\n  Authorize with: dotns bulletin authorize " + targetAddress + "\n"),
            );
          } else {
            const isExpired = authStatus.expired;
            const dateDisplay = formatExpirationDisplay(
              authStatus.currentBlock!,
              authStatus.expiration!,
            );

            console.log(
              chalk.gray("  status:       ") +
                (isExpired ? chalk.red("expired") : chalk.green("authorized")),
            );
            console.log(
              chalk.gray(isExpired ? "  expired:      " : "  expires:      ") +
                (isExpired ? chalk.red(dateDisplay) : chalk.white(dateDisplay)),
            );
            console.log(
              chalk.gray("  transactions: ") +
                chalk.white((authStatus.transactions ?? 0).toLocaleString()),
            );
            console.log(
              chalk.gray("  bytes:        ") +
                chalk.white(formatBytes(authStatus.bytes ?? BigInt(0))),
            );

            if (isExpired) {
              console.log(
                chalk.gray(
                  "\n  Re-authorize with: dotns bulletin authorize " + targetAddress + "\n",
                ),
              );
            } else {
              console.log();
            }
          }
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(command);

        if (jsonOutput) {
          console.error(JSON.stringify({ error: errorMessage }));
        } else {
          console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        }

        process.exit(1);
      }
    },
  );

  const historyCommand = bulletinCommand
    .command("history")
    .alias("list")
    .description("List all uploaded CIDs")
    .option("--json", "Output result as JSON (suppresses all other output)", false);

  historyCommand.action(async (_options: any, command: any) => {
    try {
      const jsonOutput = getJsonFlag(command);
      const history = await readHistory();

      if (jsonOutput) {
        console.log(JSON.stringify(history, null, 2));
        process.exit(0);
      }

      if (history.length === 0) {
        console.log(chalk.yellow("\n  No uploads in history.\n"));
        console.log(chalk.gray("  Upload files with: dotns bulletin upload <path>\n"));
        process.exit(0);
      }

      console.log(chalk.blue("\n▶ Upload History\n"));
      console.log(chalk.gray(`  ${history.length} upload(s) found\n`));

      history.forEach((record, index) => {
        const num = (index + 1).toString().padStart(2, " ");
        console.log(chalk.yellow(`  ${num}.`) + chalk.white(` ${formatRecordTimestamp(record)}`));
        console.log(chalk.gray("      cid:     ") + chalk.cyan(record.cid));
        if (record.ipfsCid) {
          console.log(chalk.gray("      ipfs:    ") + chalk.cyan(record.ipfsCid));
        }
        console.log(chalk.gray("      path:    ") + chalk.white(record.path));
        console.log(chalk.gray("      type:    ") + chalk.white(record.type));
        if (record.size > 0) {
          console.log(chalk.gray("      size:    ") + chalk.white(formatBytes(record.size)));
        }
        console.log(chalk.gray("      preview: ") + chalk.blue(getPreviewUrl(record)));
        console.log();
      });

      process.exit(0);
    } catch (error) {
      const jsonOutput = getJsonFlag(command);

      if (jsonOutput) {
        console.error(JSON.stringify({ error: formatErrorMessage(error) }));
        process.exit(1);
      }

      console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
      process.exit(1);
    }
  });

  bulletinCommand
    .command("history:remove <cid>")
    .description("Remove an upload from history by CID")
    .action(async (cid: string) => {
      try {
        const removed = await removeUploadRecord(cid);

        if (removed) {
          console.log(chalk.green(`\n✓ Removed ${cid} from history\n`));
        } else {
          console.log(chalk.yellow(`\n⚠ CID not found in history: ${cid}\n`));
        }

        process.exit(0);
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
        process.exit(1);
      }
    });

  bulletinCommand
    .command("history:clear")
    .description("Clear all upload history")
    .action(async () => {
      try {
        const count = await clearHistory();
        const historyPath = getHistoryPath();

        console.log(chalk.green(`\n✓ Cleared ${count} upload(s) from history`));
        console.log(chalk.gray(`  ${historyPath}\n`));

        process.exit(0);
      } catch (error) {
        console.error(chalk.red(`\n✗ Error: ${formatErrorMessage(error)}\n`));
        process.exit(1);
      }
    });
}
