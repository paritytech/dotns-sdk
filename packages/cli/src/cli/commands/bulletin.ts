import { Command } from "commander";
import chalk from "chalk";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import v8 from "node:v8";
import { promises as filesystem } from "node:fs";
import type {
  BulletinPhaseHandler,
  BulletinReporterMode,
  BulletinRetryHandler,
  BulletinUploadOptions,
  CommandOptions,
  UploadProfiler,
  UploadProfilerOptions,
  UploadProfileReport,
  UploadProfileResult,
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
import { verifyCidWithMultipleGateways, verifyCidViaP2P } from "../../bulletin/ipfs";
function cleanupHeliaAndExit(code: number): never {
  import("../../bulletin/heliaClient")
    .then(({ destroySharedHeliaClient }) => destroySharedHeliaClient())
    .catch(() => {})
    .finally(() => process.exit(code));

  setTimeout(() => process.exit(code), 500);
  return undefined as never;
}
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
} from "../../utils/constants";
import { getJsonFlag } from "./lookup";
import { clampChunkSizeBytes } from "../../bulletin/store";
import {
  createCliReporter,
  resolveReporterMode,
  withConsoleToStderr,
  type CliReporter,
  type ReporterTask,
  type ResolvedReporterMode,
} from "../reporter";

async function checkHopRpc(
  rpcUrl: string,
  hopMethods: string[],
): Promise<{ methods: string[]; poolStatus: Record<string, unknown> | null }> {
  const WebSocketImpl = globalThis.WebSocket ?? (await import("ws")).default;
  const ws = new WebSocketImpl(rpcUrl);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error(`Connection to ${rpcUrl} timed out after 15s`));
    }, 15_000);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    let methods: string[] = [];
    let poolStatus: Record<string, unknown> | null = null;
    let pendingCalls = 1; // rpc_methods

    ws.onerror = () => {
      finish(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error(`WebSocket connection to ${rpcUrl} failed`));
      });
    };

    ws.onopen = () => {
      if (settled) return;
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "rpc_methods" }));
    };

    ws.onmessage = (event: { data: string | { toString: () => string } }) => {
      try {
        if (settled) return;
        const raw = typeof event.data === "string" ? event.data : event.data.toString();
        const msg = JSON.parse(raw) as {
          id?: number;
          result?: any;
          error?: { message?: string };
        };

        if (msg.id === 1) {
          methods = msg.result?.methods ?? [];
          if (methods.includes("hop_poolStatus")) {
            pendingCalls++;
            ws.send(
              JSON.stringify({ jsonrpc: "2.0", id: 2, method: "hop_poolStatus", params: [] }),
            );
          }
          pendingCalls--;
        } else if (msg.id === 2) {
          poolStatus = msg.result ?? null;
          pendingCalls--;
        }

        if (pendingCalls === 0) {
          finish(() => {
            ws.close();
            resolve({ methods, poolStatus });
          });
        }
      } catch (err) {
        finish(() => {
          try { ws.close(); } catch { /* ignore */ }
          reject(err);
        });
      }
    };
  });
}

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

const PROFILE_SAMPLE_INTERVAL_MS = 2_000;

function addReporterOption(command: Command): Command {
  return command.option(
    "--reporter <mode>",
    "Progress reporter: auto, interactive, stream, or quiet",
    "auto",
  );
}

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
  ): Promise<UploadProfileResult> => {
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

async function withBulletinHumanOutput<T>(
  reporterMode: ResolvedReporterMode,
  callback: () => Promise<T>,
): Promise<T> {
  if (reporterMode === "quiet") {
    return withCapturedConsole(callback);
  }

  return withConsoleToStderr(callback);
}

async function resolveTargetAddress(
  positionalAddress: string | undefined,
  mergedOptions: any,
  reporterMode: ResolvedReporterMode,
): Promise<string> {
  if (positionalAddress) return positionalAddress;
  const context = await withBulletinHumanOutput(reporterMode, () =>
    prepareContext({ ...mergedOptions, useBulletin: true }),
  );
  return context.substrateAddress;
}

function writeBulletinJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeBulletinJsonError(error: unknown): never {
  writeBulletinJson({ error: formatErrorMessage(error) });
  process.exit(1);
}

function createPhaseHandler(reporter: CliReporter): BulletinPhaseHandler {
  const tasks = new Map<string, ReporterTask>();

  return (event) => {
    const key = event.phase;
    const activeTask = tasks.get(key);

    if (event.state === "start") {
      activeTask?.stop();
      tasks.set(key, reporter.task(event.message));
      return;
    }

    if (event.state === "update") {
      if (activeTask) {
        activeTask.update(event.message);
      } else {
        tasks.set(key, reporter.task(event.message));
      }
      return;
    }

    if (event.state === "success") {
      if (activeTask) {
        activeTask.succeed(event.message);
        tasks.delete(key);
      } else {
        reporter.success(event.message);
      }
      return;
    }

    if (event.state === "warning") {
      if (activeTask) {
        activeTask.warn(event.message);
        tasks.delete(key);
      } else {
        reporter.warn(event.message);
      }
      return;
    }

    if (activeTask) {
      activeTask.fail(event.message);
      tasks.delete(key);
      return;
    }

    reporter.fail(event.message);
  };
}

function createRetryHandler(reporter: CliReporter): BulletinRetryHandler {
  return ({ label, retry, totalAttempts, delayMs, errorMessage }) => {
    reporter.warn(`${label} attempt ${retry + 1}/${totalAttempts} failed: ${errorMessage}`);
    reporter.detail(`retrying in ${(delayMs / 1000).toFixed(delayMs >= 1000 ? 1 : 0)}s`);
  };
}

function createChunkedUploadMonitor(
  reporter: CliReporter,
  phaseHandler: BulletinPhaseHandler,
  fileSize: number,
  chunkSizeBytes: number,
  totalChunks: number,
) {
  const heartbeatIntervalMs = 15_000;
  let latestState: UploadSchedulerState | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  const startedAtMs = Date.now();

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };

  const emitHeartbeat = () => {
    if (!latestState || latestState.inFlightChunks === 0) {
      stopHeartbeat();
      return;
    }

    reporter.detail(
      `heartbeat | ${latestState.completedChunks}/${totalChunks} chunks | window=${latestState.window} | in-flight=${latestState.inFlightChunks} | bytes=${formatBytes(latestState.inFlightBytes)} | retries=${latestState.retries} | elapsed=${formatDuration((Date.now() - startedAtMs) / 1000)}`,
    );
  };

  return {
    onSchedulerState(state: UploadSchedulerState) {
      latestState = state;

      if (reporter.mode !== "stream") {
        return;
      }

      if (state.inFlightChunks > 0 && !heartbeatTimer) {
        heartbeatTimer = setInterval(emitHeartbeat, heartbeatIntervalMs);
        heartbeatTimer.unref?.();
      } else if (state.inFlightChunks === 0) {
        stopHeartbeat();
      }
    },
    onWave(wave: UploadWaveSummary) {
      const completedChunks = latestState?.completedChunks ?? 0;
      const bytesUploaded = Math.min(fileSize, completedChunks * chunkSizeBytes);
      const throughputBytesPerSecond =
        wave.durationMs > 0 ? (wave.succeeded * chunkSizeBytes * 1000) / wave.durationMs : 0;
      const message =
        `wave #${wave.wave} complete | ${completedChunks}/${totalChunks} chunks | ` +
        `${formatBytes(bytesUploaded)}/${formatBytes(fileSize)} | ` +
        `${(wave.durationMs / 1000).toFixed(1)}s | window=${wave.window} | retries=${wave.retries} | ` +
        `${formatBytes(throughputBytesPerSecond)}/s`;

      if (reporter.mode === "interactive") {
        phaseHandler({ phase: "upload", state: "update", message });
      } else {
        reporter.line(message);
      }
    },
    stop() {
      stopHeartbeat();
    },
  };
}

export function attachBulletinCommands(root: Command): void {
  const bulletinCommand = addReporterOption(
    root.command("bulletin").description("Bulletin storage utilities"),
  ).option("--json", "Write machine-readable JSON to stdout", false);

  addAuthOptions(bulletinCommand);
  const authorizeCommand = addReporterOption(
    bulletinCommand
      .command("authorize [address]")
      .description("Authorize an account for Bulletin TransactionStorage")
      .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
      .option(
        "--transactions <count>",
        "Number of transactions to authorize",
        String(DEFAULT_AUTHORIZATION_TRANSACTIONS),
      )
      .option(
        "--bytes <count>",
        "Number of bytes to authorize",
        String(DEFAULT_AUTHORIZATION_BYTES),
      )
      .option("--force", "Force re-authorization even if account appears already authorized", false)
      .option("--json", "Write machine-readable JSON to stdout", false),
  );

  addAuthOptions(authorizeCommand).action(
    async (positionalAddress: string | undefined, options: any, command: any) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);
        const reporterMode = resolveReporterMode(mergedOptions.reporter as BulletinReporterMode);
        const reporter = createCliReporter(mergedOptions.reporter as BulletinReporterMode);
        const onPhase = createPhaseHandler(reporter);

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
          reporterMode,
        );

        const signerContext = await withBulletinHumanOutput(reporterMode, () =>
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

        await withBulletinHumanOutput(reporterMode, () =>
          authorizeAccount({
            rpc: bulletinRpc,
            signer: signerContext.signer,
            targetAddress,
            transactions,
            bytes,
            force,
            onPhase,
          }),
        );

        if (jsonOutput) {
          const authStatus = await checkAuthorization(bulletinRpc, targetAddress);
          const expiresAt = expirationToISOString(authStatus.currentBlock, authStatus.expiration);
          writeBulletinJson({
            ok: true,
            target: targetAddress,
            rpc: bulletinRpc,
            transactions,
            bytes: bytes.toString(),
            expiresAt,
          });
        } else {
          console.log(chalk.green("\n✓ Authorization Complete"));
          console.log(chalk.gray("  The account can now upload to Bulletin.\n"));
        }

        process.exit(0);
      } catch (error) {
        const errorMessage = formatErrorMessage(error);
        const jsonOutput = getJsonFlag(command);

        if (jsonOutput) {
          writeBulletinJsonError(errorMessage);
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

  const uploadCommand = addReporterOption(
    bulletinCommand
      .command("upload <path>")
      .description("Upload a file or directory to Bulletin and print the resulting CID")
      .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
      .option(
        "--chunk-size <bytes>",
        "Chunk size for large uploads (clamped to 256 KB–2 MB)",
        String(DEFAULT_CHUNK_SIZE_BYTES),
      )
      .option(
        "--max-retries <n>",
        "Retry transient upload failures (default: 5, capped at 20)",
        String(DEFAULT_UPLOAD_MAX_RETRIES),
      )
      .option("--force-chunked", "Force chunked upload (DAG-PB)", false)
      .option("--concurrency <n>", "Adaptive scheduler max window (default: 16, max: 64)", "16")
      .option("--print-contenthash", "Also print 0x-prefixed IPFS contenthash for the CID", false)
      .option("--resume", "Resume a previously interrupted upload", false)
      .option("--profile-upload", "Enable upload profiling and write a JSON report", false)
      .option("--profile-output <path>", "Path to write upload profiling JSON report")
      .option("--no-history", "Do not save upload to history", true)
      .option("--cache", "Write the CID to the user's on-chain Store after upload", false)
      .option("--json", "Write machine-readable JSON to stdout", false),
  );

  addAuthOptions(uploadCommand).action(
    async (
      inputPath: string,
      options: BulletinUploadOptions & { history?: boolean },
      command: any,
    ) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);
        const reporterMode = resolveReporterMode(mergedOptions.reporter as BulletinReporterMode);
        const reporter = createCliReporter(mergedOptions.reporter as BulletinReporterMode);
        const onPhase = createPhaseHandler(reporter);
        const onRetry = createRetryHandler(reporter);

        if (mergedOptions.mnemonic && mergedOptions.keyUri) {
          throw new Error("Cannot specify both --mnemonic and --key-uri");
        }

        await cleanupStaleManifests();

        const validatedPath = await withBulletinHumanOutput(reporterMode, () =>
          validateAndReadPath(inputPath, onPhase),
        );
        const { bytes, isDirectory, resolvedPath, fileSize, fileMtimeMs } = validatedPath;

        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);
        const chunkSizeBytes = clampChunkSizeBytes(
          Number(mergedOptions.chunkSize || DEFAULT_CHUNK_SIZE_BYTES),
        );
        const maxRetries = normalizeUploadMaxRetries(mergedOptions.maxRetries);
        const concurrency = Math.max(
          1,
          Math.min(64, Math.floor(Number(mergedOptions.concurrency || 16))),
        );
        const resume = Boolean(mergedOptions.resume);
        const profileUpload = Boolean(mergedOptions.profileUpload);

        const shouldUseChunkedUpload = !isDirectory;
        const effectiveFileSize = isDirectory ? 0 : (fileSize ?? bytes.length);

        let resumedBlocks: ReturnType<typeof completedBlocksFromManifest> | undefined;
        if (resume && shouldUseChunkedUpload) {
          const resolvedFileMtimeMs = fileMtimeMs ?? (await filesystem.stat(resolvedPath)).mtimeMs;
          const manifestLoadResult = await loadManifestForResume({
            inputPath: resolvedPath,
            fileSize: effectiveFileSize,
            fileMtimeMs: resolvedFileMtimeMs,
            chunkSize: chunkSizeBytes,
          });

          if (
            manifestLoadResult.manifest &&
            manifestLoadResult.manifest.completedBlocks.length > 0
          ) {
            resumedBlocks = completedBlocksFromManifest(manifestLoadResult.manifest);
            reporter.warn(
              `resuming: ${manifestLoadResult.manifest.completedBlocks.length} blocks already uploaded`,
            );
          } else if (manifestLoadResult.staleManifest) {
            reporter.warn(
              "resume notice: file fingerprint changed, starting a fresh upload manifest",
            );
            await deleteManifest(manifestLoadResult.staleManifest);
          }
        }

        const context = await withBulletinHumanOutput(reporterMode, () =>
          prepareContext({ ...mergedOptions, useBulletin: true }),
        );

        const authInfo = await withBulletinHumanOutput(reporterMode, () =>
          ensureAccountAuthorized(bulletinRpc, context.substrateAddress),
        );

        const profileOutputOverride = mergedOptions.profileOutput
          ? String(mergedOptions.profileOutput)
          : undefined;
        const profiler = profileUpload
          ? createUploadProfiler({
              sourcePath: resolvedPath,
              sourceSizeBytes: effectiveFileSize,
              chunkSizeBytes: shouldUseChunkedUpload
                ? chunkSizeBytes
                : Math.max(1, effectiveFileSize),
              rpc: bulletinRpc,
              initialConcurrency: shouldUseChunkedUpload ? 1 : 1,
              maxConcurrency: shouldUseChunkedUpload ? concurrency : 1,
              outputPath: profileOutputOverride,
              jsonOutput,
            })
          : undefined;
        const totalChunks = shouldUseChunkedUpload
          ? Math.ceil(effectiveFileSize / chunkSizeBytes)
          : undefined;
        const chunkedMonitor =
          shouldUseChunkedUpload && totalChunks
            ? createChunkedUploadMonitor(
                reporter,
                onPhase,
                effectiveFileSize,
                chunkSizeBytes,
                totalChunks,
              )
            : null;

        const performUpload = async () => {
          if (isDirectory) {
            const result = await storeDirectory(bulletinRpc, context.signer, resolvedPath, {
              concurrency,
              accountAddress: context.substrateAddress,
              maxRetries,
              onPhase,
              onRetry,
              waitForFinalization: false,
            });
            return { cid: result.cid, size: 0 };
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
                onPhase,
                onRetry,
                onSchedulerState: (state) => {
                  profiler?.onSchedulerState(state);
                  chunkedMonitor?.onSchedulerState(state);
                },
                onWave: (wave) => {
                  profiler?.onWave(wave);
                  chunkedMonitor?.onWave(wave);
                },
              },
            );
            return { cid: result, size: effectiveFileSize };
          }

          const result = await uploadSingleBlock(bulletinRpc, context.signer, bytes, {
            maxRetries,
            onPhase,
            onRetry,
          });
          return { cid: result, size: bytes.length };
        };

        let cid: string;
        let uploadSize: number;
        let profileReportPath: string | undefined;
        let profileReport: UploadProfileReport | undefined;
        const uploadStartedAtMs = Date.now();
        const uploadStartedAtIso = new Date(uploadStartedAtMs).toISOString();
        const pathBasename = resolvedPath.split("/").pop() ?? resolvedPath;

        if (authInfo?.expiration && authInfo.currentBlock) {
          reporter.detail(
            `auth: valid (expires ${formatExpirationDisplay(authInfo.currentBlock, authInfo.expiration)})`,
          );
        }

        if (!jsonOutput) {
          if (isDirectory) {
            console.log(chalk.blue(`\n▶ Uploading directory: ${pathBasename}`));
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(
              chalk.gray("  concurrency: ") + chalk.white(`${concurrency}x parallel waves`),
            );
          } else if (shouldUseChunkedUpload) {
            console.log(
              chalk.blue(`\n▶ Uploading file: ${pathBasename} (${formatBytes(effectiveFileSize)})`),
            );
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(
              chalk.gray("  mode:        ") +
                chalk.white(
                  `chunked (${totalChunks} × ${formatBytes(chunkSizeBytes)}, adaptive window 1..${concurrency})`,
                ),
            );
          } else {
            console.log(
              chalk.blue(`\n▶ Uploading file: ${pathBasename} (${formatBytes(bytes.length)})`),
            );
            console.log(chalk.gray("  path:        ") + chalk.white(resolvedPath));
            console.log(chalk.gray("  rpc:         ") + chalk.white(bulletinRpc));
            console.log(chalk.gray("  mode:        ") + chalk.white("single block"));
          }
        }

        try {
          const uploadResult = await withBulletinHumanOutput(reporterMode, performUpload);
          cid = uploadResult.cid;
          uploadSize = uploadResult.size;
        } finally {
          chunkedMonitor?.stop();
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

        onPhase({
          phase: "verify",
          state: "start",
          message: "Verifying content on Bulletin P2P...",
        });
        let verified = false;
        try {
          const p2pResult = await verifyCidViaP2P(cid);
          if (p2pResult.resolvable) {
            onPhase({ phase: "verify", state: "success", message: "Content verified via P2P" });
            verified = true;
          }
        } catch {
          /* P2P verification failed, try gateways */
        }

        if (!verified) {
          onPhase({
            phase: "verify",
            state: "update",
            message: "P2P unavailable, checking IPFS gateways...",
          });
          const gatewayResults = await verifyCidWithMultipleGateways(cid);
          const resolvable = Array.from(gatewayResults.values()).some((r) => r.resolvable);
          if (resolvable) {
            onPhase({
              phase: "verify",
              state: "success",
              message: "Content verified via IPFS gateway",
            });
          } else {
            onPhase({
              phase: "verify",
              state: "warning",
              message: "Content not yet resolvable — it may still be propagating",
            });
          }
        }

        const contenthash = generateContenthash(cid);

        const previewUrl = getPreviewUrl({
          cid,
          path: resolvedPath,
          type: (isDirectory ? "directory" : "file") as "directory" | "file",
          size: uploadSize,
          timestamp: "",
        });

        if (jsonOutput) {
          const authExpiresAt = expirationToISOString(authInfo?.currentBlock, authInfo?.expiration);
          writeBulletinJson({
            cid,
            contenthash: `0x${contenthash}`,
            preview: previewUrl,
            path: resolvedPath,
            type: isDirectory ? "directory" : "file",
            size: uploadSize,
            authorizationExpiresAt: authExpiresAt,
            uploadStartedAtIso,
            uploadFinishedAtIso,
            totalUploadTimeMs,
            totalUploadTimeSeconds,
          });
        } else {
          console.log(chalk.gray("\n  cid:         ") + chalk.cyan(cid));
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
                chalk.white(`${formatBytes(profileReport.summary.throughputBytesPerSecond)}/s`),
            );
            console.log(
              chalk.gray("  peak heap:   ") +
                chalk.white(formatBytes(profileReport.summary.peakHeapUsed)),
            );
          }

          console.log(chalk.green("\n✓ Upload Complete\n"));
        }

        if (options.cache) {
          onPhase({
            phase: "cache",
            state: "start",
            message: "Saving CID to on-chain Store...",
          });
          try {
            const { cacheCidToStore } = await import("../../commands/storeManagement");
            const { createClient } = await import("polkadot-api");
            const { getWsProvider } = await import("polkadot-api/ws-provider");
            const { paseo } = await import("@polkadot-api/descriptors");
            const { ReviveClientWrapper } = await import("../../client/polkadotClient");
            const { resolveRpc } = await import("../env");

            const rpc = resolveRpc(process.env.DOTNS_RPC);
            const typedApi = createClient(getWsProvider(rpc)).getTypedApi(paseo);
            const clientWrapper = new ReviveClientWrapper(typedApi as any);
            const evmAddress = await clientWrapper.getEvmAddress(context.substrateAddress);

            await cacheCidToStore({
              cid,
              clientWrapper,
              signer: context.signer,
              substrateAddress: context.substrateAddress,
              evmAddress,
            });
            onPhase({ phase: "cache", state: "success", message: "CID cached to Store" });
          } catch (cacheError) {
            const msg = formatErrorMessage(cacheError);
            let reason: string;
            if (/insufficient|balance/i.test(msg)) {
              reason =
                "insufficient PAS balance on Asset Hub — fund the account and retry with --cache";
            } else if (/no store deployed|store not deployed/i.test(msg)) {
              reason = "no Store deployed — register a domain first or deploy a Store manually";
            } else if (/not authorized|unauthorized/i.test(msg)) {
              reason = "Store not authorised for writes — run dotns store ensure-auth";
            } else {
              reason = msg;
            }
            onPhase({
              phase: "cache",
              state: "warning",
              message: `Store caching skipped: ${reason}`,
            });
          }
        }

        if (mergedOptions.history !== false) {
          await addUploadRecord({
            cid,
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
          writeBulletinJsonError(errorMessage);
        }

        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    },
  );

  const statusCommand = addReporterOption(
    bulletinCommand
      .command("status [address]")
      .description("Check authorization status for an account on Bulletin")
      .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
      .option("--json", "Write machine-readable JSON to stdout", false),
  );

  addAuthOptions(statusCommand).action(
    async (positionalAddress: string | undefined, options: any, command: any) => {
      try {
        const mergedOptions = getMergedOptions(command, options);
        const jsonOutput = getJsonFlag(command);
        const reporterMode = resolveReporterMode(mergedOptions.reporter as BulletinReporterMode);
        const reporter = createCliReporter(mergedOptions.reporter as BulletinReporterMode);
        const bulletinRpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);

        const targetAddress = await resolveTargetAddress(
          positionalAddress,
          mergedOptions,
          reporterMode,
        );

        const statusTask = reporter.task("Checking authorization");
        const authStatus = await checkAuthorization(bulletinRpc, targetAddress);
        statusTask.succeed("Authorization status read");

        if (jsonOutput) {
          writeBulletinJson({
            address: targetAddress,
            rpc: bulletinRpc,
            authorized: authStatus.authorized,
            expired: authStatus.expired ?? false,
            transactions: authStatus.transactions ?? 0,
            bytes: (authStatus.bytes ?? BigInt(0)).toString(),
            expiresAt: expirationToISOString(authStatus.currentBlock, authStatus.expiration),
          });
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
          writeBulletinJsonError(errorMessage);
        } else {
          console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
          process.exit(1);
        }
      }
    },
  );

  const historyCommand = addReporterOption(
    bulletinCommand
      .command("history")
      .alias("list")
      .description("List all uploaded CIDs")
      .option("--json", "Write machine-readable JSON to stdout", false),
  );

  historyCommand.action(async (_options: any, command: any) => {
    try {
      const jsonOutput = getJsonFlag(command);
      const history = await readHistory();

      if (jsonOutput) {
        writeBulletinJson(history);
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
        writeBulletinJsonError(error);
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

  addReporterOption(
    bulletinCommand.command("history:clear").description("Clear all upload history"),
  ).action(async () => {
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

  addReporterOption(
    bulletinCommand
      .command("verify <cid>")
      .description("Verify a CID is resolvable via IPFS gateways")
      .option("--json", "Write machine-readable JSON to stdout", false),
  ).action(async (cid: string, options: any, command: any) => {
    const mergedOptions = getMergedOptions(command, options);
    const jsonOutput = getJsonFlag(command) || Boolean(options.json);
    const reporter = createCliReporter(mergedOptions.reporter as BulletinReporterMode);
    const p2pTask = reporter.task("Connecting to Bulletin P2P");

    try {
      if (!jsonOutput) {
        console.log(chalk.blue("\n▶ Verifying CID"));
        console.log(chalk.gray("  cid: ") + chalk.cyan(cid));
      }

      const p2pResult = await verifyCidViaP2P(cid);

      if (p2pResult.resolvable) {
        p2pTask.succeed("CID verified via P2P (bitswap)");

        if (jsonOutput) {
          writeBulletinJson({
            cid,
            resolvable: true,
            method: "p2p",
            gateways: [{ gateway: "p2p/bitswap", resolvable: true }],
          });
        } else {
          console.log(chalk.gray("  ✓ ") + chalk.white("p2p/bitswap"));
          console.log();
        }

        cleanupHeliaAndExit(0);
      }

      p2pTask.warn("P2P verification failed, falling back to gateways");

      const gatewayTask = reporter.task("Checking IPFS gateways");
      const results = await verifyCidWithMultipleGateways(cid);
      const resolvableGateways: string[] = [];
      const failedGateways: string[] = [];

      for (const [gateway, result] of results) {
        if (result.resolvable) {
          resolvableGateways.push(gateway);
        } else {
          failedGateways.push(gateway);
        }
      }

      if (jsonOutput) {
        const entries = Array.from(results.entries()).map(([gateway, result]) => ({
          gateway,
          resolvable: result.resolvable,
          statusCode: result.statusCode,
          errorMessage: result.errorMessage,
        }));
        writeBulletinJson({
          cid,
          resolvable: resolvableGateways.length > 0,
          method: resolvableGateways.length > 0 ? "gateway" : "none",
          gateways: entries,
        });
        cleanupHeliaAndExit(resolvableGateways.length > 0 ? 0 : 1);
      }

      if (resolvableGateways.length > 0) {
        gatewayTask.succeed(`CID resolvable on ${resolvableGateways.length} gateway(s)`);
        for (const gw of resolvableGateways) {
          console.log(chalk.gray("  ✓ ") + chalk.white(gw));
        }
      } else {
        gatewayTask.fail("CID not resolvable on any gateway");
      }

      if (failedGateways.length > 0 && resolvableGateways.length > 0) {
        for (const gw of failedGateways) {
          console.log(chalk.gray("  ✗ ") + chalk.dim(gw));
        }
      }

      console.log();
      cleanupHeliaAndExit(resolvableGateways.length > 0 ? 0 : 1);
    } catch (error) {
      p2pTask.fail("Verification failed");
      const errorMessage = formatErrorMessage(error);
      if (jsonOutput) {
        writeBulletinJsonError(errorMessage);
      } else {
        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        cleanupHeliaAndExit(1);
      }
    }
  });

  addReporterOption(
    bulletinCommand
      .command("hop-check")
      .description("Check if a Bulletin collator has HOP enabled")
      .option("--bulletin-rpc <wsUrl>", "Bulletin WebSocket RPC endpoint", DEFAULT_BULLETIN_RPC)
      .option("--json", "Write machine-readable JSON to stdout", false),
  ).action(async (options: any, command: any) => {
    const mergedOptions = getMergedOptions(command, options);
    const jsonOutput = getJsonFlag(command) || Boolean(options.json);
    const reporter = createCliReporter(mergedOptions.reporter as BulletinReporterMode);
    const rpc = String(mergedOptions.bulletinRpc || DEFAULT_BULLETIN_RPC);

    const methodsTask = reporter.task(`Connecting to ${rpc}`);

    try {
      const hopMethods = ["hop_submit", "hop_claim", "hop_poolStatus"];
      const { methods, poolStatus } = await checkHopRpc(rpc, hopMethods);

      const results = hopMethods.map((m) => ({
        method: m,
        available: methods.includes(m),
      }));
      const allPresent = results.every((r) => r.available);

      if (allPresent) {
        methodsTask.succeed("HOP is enabled");
      } else {
        methodsTask.fail("HOP methods missing");
      }

      if (jsonOutput) {
        writeBulletinJson({
          rpc,
          hopEnabled: allPresent,
          methods: results,
          ...(poolStatus ? { poolStatus } : {}),
        });
        process.exit(allPresent ? 0 : 1);
      }

      console.log(chalk.blue("\n▶ HOP RPC Check"));
      console.log(chalk.gray("  endpoint: ") + chalk.white(rpc));
      console.log();

      for (const r of results) {
        const icon = r.available ? chalk.green("✓") : chalk.red("✗");
        const label = r.available ? chalk.white(r.method) : chalk.red(r.method + " MISSING");
        console.log(`  ${icon} ${label}`);
      }

      if (poolStatus) {
        const totalBytes = Number(poolStatus.totalBytes ?? 0);
        const maxBytes = Number(poolStatus.maxBytes ?? 0);
        console.log(chalk.blue("\n▶ Pool Status"));
        console.log(
          chalk.gray("  entries:   ") + chalk.white(String(poolStatus.entryCount ?? 0)),
        );
        console.log(
          chalk.gray("  used:      ") + chalk.white(formatBytes(totalBytes)),
        );
        console.log(
          chalk.gray("  capacity:  ") + chalk.white(formatBytes(maxBytes)),
        );
      }

      console.log();
      process.exit(allPresent ? 0 : 1);
    } catch (error) {
      methodsTask.fail("Connection failed");
      const errorMessage = formatErrorMessage(error);

      if (jsonOutput) {
        writeBulletinJsonError(errorMessage);
      } else {
        console.error(chalk.red(`\n✗ Error: ${errorMessage}\n`));
        process.exit(1);
      }
    }
  });
}
