#!/usr/bin/env bun

import { parseArgs } from "node:util";
import { promises as filesystem, createReadStream } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { importer } from "ipfs-unixfs-importer";
import { fixedSize } from "ipfs-unixfs-importer/chunker";
import { getPolkadotSigner } from "polkadot-api/signer";
import type { PolkadotSigner } from "polkadot-api";
import type { CID } from "multiformats/cid";
import {
  createBulletinClient,
  destroyBulletinClient,
  fetchAccountNonce,
  storeBatchToBulletin,
  storeBlockToBulletin,
} from "../src/bulletin/store";
import { resolveAuthSource, createAccountFromSource } from "../src/commands/auth";
import { ensureAccountAuthorized } from "../src/commands/bulletin";
import {
  isReconnectRequiredUploadError,
  isRetryableUploadError,
} from "../src/bulletin/uploadRetry";
import {
  formatBytes,
  formatDuration,
  formatErrorMessage,
} from "../src/utils/formatting";
import { DEFAULT_BULLETIN_RPC } from "../src/utils/constants";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_ROOT = path.resolve(__dirname, "..");
const RESULTS_DIR = path.join(CLI_ROOT, "benchmarks", "results");
const DEFAULT_IMPORT_CHUNK_SIZE_BYTES = 256 * 1024;
const TWO_MEGABYTES = 2 * 1024 * 1024;
const DEFAULT_STRATEGY_TIMEOUT_MINUTES = 60;
const RETRY_DELAYS_MS = [200, 400, 800] as const;
const DEFAULT_WAVE_RETRIES = 3;
const RESOURCE_SAMPLE_INTERVAL_MS = 250;
const CHILD_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

type StrategyName =
  | "sequential-1"
  | "waves-4"
  | "waves-16"
  | "waves-64"
  | "pipeline-16"
  | "fire-and-forget-all"
  | "batched-fire-and-forget-32"
  | "batch-all-4"
  | "chunks-2mb-waves-4";

type StrategyStatus = "success" | "failure" | "partial" | "timeout";

type BenchmarkCliValues = {
  input?: string;
  strategies: string;
  rpc: string;
  account: string;
  password: string;
  keystorePath?: string;
  mnemonic?: string;
  keyUri?: string;
  output?: string;
  worker?: string;
  resultFile?: string;
  help: boolean;
  listStrategies: boolean;
  timeoutMinutes: string;
  importChunkSize: string;
};

type PreparedBlock = {
  index: number;
  cid: string;
  bytes: Uint8Array;
  size: number;
  codecValue: number;
  hashCodeValue: number;
};

type PreparedDataset = {
  resolvedPath: string;
  isDirectory: boolean;
  importChunkSizeBytes: number;
  rootCid: string;
  totalBlocks: number;
  totalBytes: number;
  blocks: PreparedBlock[];
};

type ErrorSummary = {
  message: string;
  count: number;
};

type ResourceSummary = {
  peakRss: number;
  peakHeapUsed: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
};

type StrategyExecutionResult = {
  strategy: StrategyName;
  label: string;
  description: string;
  status: StrategyStatus;
  startedAtIso: string;
  finishedAtIso: string;
  elapsedMs: number;
  completedBlocks: number;
  failedBlocks: number;
  uploadedBytes: number;
  throughputBytesPerSecond: number;
  transactionsPerSecond: number;
  peakRss: number;
  peakHeapUsed: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  reconnects: number;
  dataset: Omit<PreparedDataset, "blocks">;
  errors: ErrorSummary[];
  notes: string[];
};

type AggregateBenchmarkResult = {
  version: 1;
  startedAtIso: string;
  finishedAtIso: string;
  input: string;
  rpc: string;
  strategies: StrategyName[];
  outputPath: string;
  results: StrategyExecutionResult[];
};

type StrategyDefinition = {
  label: string;
  description: string;
  importChunkSizeBytes?: number;
  run: (context: StrategyRunContext) => Promise<StrategyRunOutcome>;
};

type StrategyRunContext = {
  dataset: PreparedDataset;
  signer: PolkadotSigner;
  accountAddress: string;
  rpc: string;
};

type StrategyRunOutcome = {
  status: Exclude<StrategyStatus, "timeout">;
  completedBlocks: number;
  uploadedBytes: number;
  reconnects: number;
  errors: ErrorSummary[];
  notes: string[];
};

type BulletinSession = {
  rpc: string;
  signer: PolkadotSigner;
  accountAddress: string;
  client: ReturnType<typeof createBulletinClient>;
  nextNonce: number;
  reconnects: number;
};

type StrategyRecorder = {
  completedBlocks: number;
  uploadedBytes: number;
  errors: Map<string, number>;
  notes: string[];
  markSuccess: (block: PreparedBlock) => void;
  markFailure: (error: unknown) => void;
  addNote: (note: string) => void;
  toOutcome: (status: Exclude<StrategyStatus, "timeout">, reconnects: number) => StrategyRunOutcome;
};

export const ALL_STRATEGY_NAMES: StrategyName[] = [
  "sequential-1",
  "waves-4",
  "waves-16",
  "waves-64",
  "pipeline-16",
  "fire-and-forget-all",
  "batched-fire-and-forget-32",
  "batch-all-4",
  "chunks-2mb-waves-4",
];

const STRATEGIES: Record<StrategyName, StrategyDefinition> = {
  "sequential-1": {
    label: "Sequential (concurrency 1)",
    description: "Submit one block at a time and wait for inclusion before the next submission.",
    run: async (context) => runWaveStrategy(context, 1),
  },
  "waves-4": {
    label: "Sequential waves (concurrency 4)",
    description: "Submit four blocks with Promise.all and wait for the wave to settle before continuing.",
    run: async (context) => runWaveStrategy(context, 4),
  },
  "waves-16": {
    label: "Sequential waves (concurrency 16)",
    description: "Submit sixteen watched transactions per wave and wait for the full wave before continuing.",
    run: async (context) => runWaveStrategy(context, 16),
  },
  "waves-64": {
    label: "Sequential waves (concurrency 64)",
    description: "Submit sixty-four watched transactions per wave and observe node-side stability limits.",
    run: async (context) => runWaveStrategy(context, 64),
  },
  "pipeline-16": {
    label: "Pipeline with backpressure (concurrency 16)",
    description: "Maintain a sliding window of sixteen in-flight watched submissions.",
    run: async (context) => runPipelineStrategy(context, 16),
  },
  "fire-and-forget-all": {
    label: "Fire-and-forget (all at once)",
    description: "Submit all watched store extrinsics immediately with pre-assigned nonces and settle later.",
    run: async (context) => runFireAndForgetStrategy(context),
  },
  "batched-fire-and-forget-32": {
    label: "Batched fire-and-forget (32 per batch)",
    description: "Queue watched submissions in batches of thirty-two without waiting between batches.",
    run: async (context) => runBatchedFireAndForgetStrategy(context, 32),
  },
  "batch-all-4": {
    label: "Utility.batch_all (4 stores per batch)",
    description: "Wrap four store calls inside Utility.batch_all and submit sequential batch extrinsics.",
    run: async (context) => runBatchAllStrategy(context, 4),
  },
  "chunks-2mb-waves-4": {
    label: "2 MB importer chunks with waves (concurrency 4)",
    description: "Re-merkleize with a 2 MB fixed-size chunker and upload using four-wide watched waves.",
    importChunkSizeBytes: TWO_MEGABYTES,
    run: async (context) => runWaveStrategy(context, 4),
  },
};

export function expandStrategySelection(selection: string): StrategyName[] {
  const rawTokens = selection
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (rawTokens.length === 0 || rawTokens.includes("all")) {
    return [...ALL_STRATEGY_NAMES];
  }

  const selected = new Set<StrategyName>();

  for (const token of rawTokens) {
    if (!ALL_STRATEGY_NAMES.includes(token as StrategyName)) {
      throw new Error(
        `Unknown strategy: ${token}. Use --list-strategies to see the supported strategy names.`,
      );
    }
    selected.add(token as StrategyName);
  }

  return ALL_STRATEGY_NAMES.filter((name) => selected.has(name));
}

export function buildDefaultAggregateOutputPath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(RESULTS_DIR, `strategy-benchmark-${timestamp}.json`);
}

function printHelp(): void {
  console.log(`
Usage: bun benchmarks/strategy-benchmark.ts [options]

Runs the published Bulletin upload strategy rows in isolated worker processes.
The article speaks about eight approaches, but the published results table contains
multiple wave-concurrency rows. This harness exposes every published row.

Options:
  --input <path>                 File or directory to benchmark (required)
  --strategies <list>            Comma-separated strategies or all (default: all)
  --rpc <wsUrl>                  Bulletin RPC endpoint (default: ${DEFAULT_BULLETIN_RPC})
  --account <name>               Keystore account name (default: alice)
  --password <pw>                Keystore password (default: 123456)
  --keystore-path <path>         Keystore directory path
  --mnemonic <phrase>            BIP39 mnemonic phrase
  --key-uri <uri>                Substrate key URI
  --timeout-minutes <n>          Per-strategy timeout in minutes (default: ${DEFAULT_STRATEGY_TIMEOUT_MINUTES})
  --import-chunk-size <bytes>    Baseline importer chunk size in bytes (default: ${DEFAULT_IMPORT_CHUNK_SIZE_BYTES})
  --output <path>                Aggregate JSON output path
  --list-strategies              Print supported strategy names and exit
  --help, -h                     Show this help message

Example:
  bun benchmarks/strategy-benchmark.ts \
    --input ../dotns-web/dist \
    --key-uri //Alice \
    --strategies all
`);
}

function printStrategies(): void {
  console.log("\nSupported strategies:\n");
  for (const name of ALL_STRATEGY_NAMES) {
    const definition = STRATEGIES[name];
    console.log(`  ${name.padEnd(28)} ${definition.label}`);
    console.log(`  ${"".padEnd(28)} ${definition.description}`);
  }
  console.log();
}

function parseCliValues(): BenchmarkCliValues {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      input: { type: "string" },
      strategies: { type: "string", default: "all" },
      rpc: { type: "string", default: DEFAULT_BULLETIN_RPC },
      account: { type: "string", default: "alice" },
      password: { type: "string", default: "123456" },
      "keystore-path": { type: "string" },
      mnemonic: { type: "string" },
      "key-uri": { type: "string" },
      output: { type: "string" },
      worker: { type: "string" },
      "result-file": { type: "string" },
      "timeout-minutes": {
        type: "string",
        default: String(DEFAULT_STRATEGY_TIMEOUT_MINUTES),
      },
      "import-chunk-size": {
        type: "string",
        default: String(DEFAULT_IMPORT_CHUNK_SIZE_BYTES),
      },
      "list-strategies": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  return {
    input: values.input,
    strategies: values.strategies,
    rpc: values.rpc,
    account: values.account,
    password: values.password,
    keystorePath: values["keystore-path"],
    mnemonic: values.mnemonic,
    keyUri: values["key-uri"],
    output: values.output,
    worker: values.worker,
    resultFile: values["result-file"],
    help: values.help,
    listStrategies: values["list-strategies"],
    timeoutMinutes: values["timeout-minutes"],
    importChunkSize: values["import-chunk-size"],
  };
}

function normalizeTimeoutMinutes(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STRATEGY_TIMEOUT_MINUTES;
}

function normalizeChunkSizeBytes(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IMPORT_CHUNK_SIZE_BYTES;
}

function summarizeError(error: unknown): string {
  return formatErrorMessage(error).split("\n")[0] ?? String(error);
}

function createRecorder(): StrategyRecorder {
  const errors = new Map<string, number>();
  const completed = new Set<number>();
  const notes: string[] = [];
  let completedBlocks = 0;
  let uploadedBytes = 0;

  return {
    completedBlocks,
    uploadedBytes,
    errors,
    notes,
    markSuccess(block) {
      if (completed.has(block.index)) {
        return;
      }
      completed.add(block.index);
      completedBlocks += 1;
      uploadedBytes += block.size;
      this.completedBlocks = completedBlocks;
      this.uploadedBytes = uploadedBytes;
    },
    markFailure(error) {
      const message = summarizeError(error);
      errors.set(message, (errors.get(message) ?? 0) + 1);
    },
    addNote(note) {
      notes.push(note);
    },
    toOutcome(status, reconnects) {
      return {
        status,
        completedBlocks,
        uploadedBytes,
        reconnects,
        errors: [...errors.entries()]
          .map(([message, count]) => ({ message, count }))
          .sort((left, right) => right.count - left.count),
        notes: [...notes],
      };
    },
  };
}

function startResourceSampler() {
  let peakRss = process.memoryUsage().rss;
  let peakHeapUsed = process.memoryUsage().heapUsed;
  const cpuStart = process.cpuUsage();
  const timer = setInterval(() => {
    const usage = process.memoryUsage();
    peakRss = Math.max(peakRss, usage.rss);
    peakHeapUsed = Math.max(peakHeapUsed, usage.heapUsed);
  }, RESOURCE_SAMPLE_INTERVAL_MS);

  timer.unref?.();

  return {
    stop(): ResourceSummary {
      clearInterval(timer);
      const usage = process.memoryUsage();
      peakRss = Math.max(peakRss, usage.rss);
      peakHeapUsed = Math.max(peakHeapUsed, usage.heapUsed);
      const cpu = process.cpuUsage(cpuStart);
      return {
        peakRss,
        peakHeapUsed,
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
      };
    },
  };
}

async function* walkInputRecursively(
  directoryPath: string,
): AsyncGenerator<{ path: string; fullPath: string }> {
  const entries = await filesystem.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      for await (const nested of walkInputRecursively(fullPath)) {
        yield { path: path.join(entry.name, nested.path), fullPath: nested.fullPath };
      }
      continue;
    }

    if (entry.isFile()) {
      yield { path: entry.name, fullPath };
    }
  }
}

async function prepareDataset(
  inputPath: string,
  importChunkSizeBytes: number,
): Promise<PreparedDataset> {
  const resolvedPath = path.resolve(CLI_ROOT, inputPath);
  const stats = await filesystem.stat(resolvedPath);
  const isDirectory = stats.isDirectory();
  const blocks = new Map<string, PreparedBlock>();
  let rootCid: CID | undefined;

  const blockstore = {
    put: async (cid: CID, bytes: Uint8Array): Promise<CID> => {
      const cidString = cid.toString();
      if (!blocks.has(cidString)) {
        blocks.set(cidString, {
          index: blocks.size,
          cid: cidString,
          bytes,
          size: bytes.length,
          codecValue: cid.code,
          hashCodeValue: cid.multihash.code,
        });
      }
      return cid;
    },
    get: async (cid: CID): Promise<Uint8Array> => {
      const block = blocks.get(cid.toString());
      if (!block) {
        throw new Error(`Missing block during merkleization: ${cid}`);
      }
      return block.bytes;
    },
  };

  async function* importerSource(): AsyncGenerator<{ path?: string; content: AsyncIterable<Uint8Array> }> {
    if (isDirectory) {
      for await (const file of walkInputRecursively(resolvedPath)) {
        yield { path: file.path, content: createReadStream(file.fullPath) };
      }
      return;
    }

    yield {
      path: path.basename(resolvedPath),
      content: createReadStream(resolvedPath),
    };
  }

  for await (const entry of importer(importerSource(), blockstore, {
    wrapWithDirectory: isDirectory,
    cidVersion: 1,
    rawLeaves: true,
    chunker: fixedSize({ chunkSize: importChunkSizeBytes }),
  })) {
    rootCid = entry.cid;
  }

  if (!rootCid) {
    throw new Error("Merkleization produced no root CID");
  }

  const orderedBlocks = [...blocks.values()];
  const totalBytes = orderedBlocks.reduce((sum, block) => sum + block.size, 0);

  return {
    resolvedPath,
    isDirectory,
    importChunkSizeBytes,
    rootCid: rootCid.toString(),
    totalBlocks: orderedBlocks.length,
    totalBytes,
    blocks: orderedBlocks,
  };
}

async function prepareSigner(options: BenchmarkCliValues): Promise<{
  signer: PolkadotSigner;
  accountAddress: string;
  resolvedFrom: string;
  accountName: string;
}> {
  const auth = await resolveAuthSource({
    mnemonic: options.mnemonic,
    keyUri: options.keyUri,
    keystorePath: options.keystorePath,
    account: options.account,
    password: options.password,
  });

  const account = await createAccountFromSource(auth.source, auth.isKeyUri);
  const signer = getPolkadotSigner(account.publicKey, "Sr25519", async (input) => account.sign(input));

  return {
    signer,
    accountAddress: account.address,
    resolvedFrom: auth.resolvedFrom,
    accountName: auth.account,
  };
}

async function createSession(
  rpc: string,
  signer: PolkadotSigner,
  accountAddress: string,
): Promise<BulletinSession> {
  return {
    rpc,
    signer,
    accountAddress,
    client: createBulletinClient(rpc),
    nextNonce: await fetchAccountNonce(rpc, accountAddress),
    reconnects: 0,
  };
}

function destroySession(session: BulletinSession | null | undefined): void {
  destroyBulletinClient(session?.client);
}

async function recreateSession(session: BulletinSession): Promise<void> {
  destroySession(session);
  session.client = createBulletinClient(session.rpc);
  session.nextNonce = await fetchAccountNonce(session.rpc, session.accountAddress);
  session.reconnects += 1;
}

function takeNonce(session: BulletinSession): number {
  const nonce = session.nextNonce;
  session.nextNonce += 1;
  return nonce;
}

async function submitBlock(
  session: BulletinSession,
  block: PreparedBlock,
  nonce: number,
): Promise<void> {
  await storeBlockToBulletin({
    rpc: session.rpc,
    signer: session.signer,
    contentBytes: block.bytes,
    contentCid: block.cid,
    codecValue: block.codecValue,
    hashCodeValue: block.hashCodeValue,
    nonce,
    client: session.client,
    waitForFinalization: false,
  });
}

async function runWaveStrategy(
  context: StrategyRunContext,
  waveSize: number,
): Promise<StrategyRunOutcome> {
  const recorder = createRecorder();
  const session = await createSession(context.rpc, context.signer, context.accountAddress);

  try {
    for (let waveStart = 0; waveStart < context.dataset.blocks.length; waveStart += waveSize) {
      let pending = context.dataset.blocks.slice(waveStart, waveStart + waveSize);
      let retryCount = 0;
      const waveNumber = Math.floor(waveStart / waveSize) + 1;
      console.log(
        `  wave ${waveNumber}: submitting ${pending.length} block(s) starting at ${waveStart + 1}/${context.dataset.totalBlocks}`,
      );

      while (pending.length > 0) {
        const waveNonces = pending.map(() => takeNonce(session));
        const results = await Promise.all(
          pending.map(async (block, index) => {
            try {
              await submitBlock(session, block, waveNonces[index]!);
              return { ok: true as const, block };
            } catch (error) {
              return { ok: false as const, block, error };
            }
          }),
        );

        const retryableFailures: PreparedBlock[] = [];
        let terminalError: unknown;

        for (const result of results) {
          if (result.ok) {
            recorder.markSuccess(result.block);
            continue;
          }

          const reconnectRequired = isReconnectRequiredUploadError(result.error);
          const retryable = isRetryableUploadError(result.error);

          if (retryable && retryCount < DEFAULT_WAVE_RETRIES) {
            retryableFailures.push(result.block);
            if (reconnectRequired) {
              recorder.addNote(`wave ${waveNumber}: reconnect triggered by ${summarizeError(result.error)}`);
            }
            continue;
          }

          recorder.markFailure(result.error);
          terminalError ??= result.error;
        }

        if (terminalError) {
          recorder.addNote(`wave ${waveNumber} aborted: ${summarizeError(terminalError)}`);
          throw terminalError;
        }

        if (retryableFailures.length === 0) {
          break;
        }

        retryCount += 1;
        await recreateSession(session);
        const delayMs = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)] ?? 0;
        recorder.addNote(
          `wave ${waveNumber}: retry ${retryCount} for ${retryableFailures.length} block(s) after ${delayMs}ms`,
        );
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        pending = retryableFailures;
      }
    }

    return recorder.toOutcome("success", session.reconnects);
  } catch (error) {
    const status = recorder.completedBlocks > 0 ? "partial" : "failure";
    recorder.addNote(`terminal error: ${summarizeError(error)}`);
    return recorder.toOutcome(status, session.reconnects);
  } finally {
    destroySession(session);
  }
}

async function runPipelineStrategy(
  context: StrategyRunContext,
  concurrency: number,
): Promise<StrategyRunOutcome> {
  const recorder = createRecorder();
  const session = await createSession(context.rpc, context.signer, context.accountAddress);
  const inFlight = new Set<Promise<void>>();
  let nextIndex = 0;
  let terminalError: unknown;

  try {
    const launchNext = () => {
      while (!terminalError && nextIndex < context.dataset.blocks.length && inFlight.size < concurrency) {
        const block = context.dataset.blocks[nextIndex]!;
        nextIndex += 1;
        const nonce = takeNonce(session);
        let task: Promise<void>;
        task = submitBlock(session, block, nonce)
          .then(() => {
            recorder.markSuccess(block);
          })
          .catch((error) => {
            recorder.markFailure(error);
            terminalError ??= error;
          })
          .finally(() => {
            inFlight.delete(task);
          });
        inFlight.add(task);
      }
    };

    launchNext();

    while (inFlight.size > 0) {
      await Promise.race(inFlight);
      launchNext();
    }

    if (terminalError) {
      recorder.addNote(`pipeline stopped after ${recorder.completedBlocks} block(s): ${summarizeError(terminalError)}`);
      return recorder.toOutcome(recorder.completedBlocks > 0 ? "partial" : "failure", session.reconnects);
    }

    return recorder.toOutcome("success", session.reconnects);
  } finally {
    destroySession(session);
  }
}

async function runFireAndForgetStrategy(
  context: StrategyRunContext,
): Promise<StrategyRunOutcome> {
  const recorder = createRecorder();
  const session = await createSession(context.rpc, context.signer, context.accountAddress);

  try {
    const submissions = context.dataset.blocks.map((block) => {
      const nonce = takeNonce(session);
      return submitBlock(session, block, nonce)
        .then(() => {
          recorder.markSuccess(block);
        })
        .catch((error) => {
          recorder.markFailure(error);
        });
    });

    await Promise.allSettled(submissions);

    const status =
      recorder.completedBlocks === context.dataset.totalBlocks
        ? "success"
        : recorder.completedBlocks > 0
          ? "partial"
          : "failure";

    if (status !== "success") {
      recorder.addNote(
        `fire-and-forget settled with ${recorder.completedBlocks}/${context.dataset.totalBlocks} successful blocks`,
      );
    }

    return recorder.toOutcome(status, session.reconnects);
  } finally {
    destroySession(session);
  }
}

async function runBatchedFireAndForgetStrategy(
  context: StrategyRunContext,
  batchSize: number,
): Promise<StrategyRunOutcome> {
  const recorder = createRecorder();
  const session = await createSession(context.rpc, context.signer, context.accountAddress);

  try {
    const submissions: Promise<void>[] = [];
    let batchNumber = 0;

    for (let start = 0; start < context.dataset.blocks.length; start += batchSize) {
      batchNumber += 1;
      const batch = context.dataset.blocks.slice(start, start + batchSize);
      console.log(`  queueing batch ${batchNumber} (${batch.length} block(s))`);
      for (const block of batch) {
        const nonce = takeNonce(session);
        submissions.push(
          submitBlock(session, block, nonce)
            .then(() => {
              recorder.markSuccess(block);
            })
            .catch((error) => {
              recorder.markFailure(error);
            }),
        );
      }
    }

    await Promise.allSettled(submissions);

    const status =
      recorder.completedBlocks === context.dataset.totalBlocks
        ? "success"
        : recorder.completedBlocks > 0
          ? "partial"
          : "failure";

    if (status !== "success") {
      recorder.addNote(
        `batched fire-and-forget settled with ${recorder.completedBlocks}/${context.dataset.totalBlocks} successful blocks`,
      );
    }

    return recorder.toOutcome(status, session.reconnects);
  } finally {
    destroySession(session);
  }
}

async function runBatchAllStrategy(
  context: StrategyRunContext,
  batchSize: number,
): Promise<StrategyRunOutcome> {
  const recorder = createRecorder();
  const session = await createSession(context.rpc, context.signer, context.accountAddress);

  try {
    for (let start = 0; start < context.dataset.blocks.length; start += batchSize) {
      const batch = context.dataset.blocks.slice(start, start + batchSize);
      const nonce = takeNonce(session);
      console.log(`  batch_all ${Math.floor(start / batchSize) + 1}: ${batch.length} block(s)`);

      try {
        await storeBatchToBulletin({
          signer: context.signer as never,
          blocks: batch.map((block) => ({
            contentBytes: block.bytes,
            contentCid: block.cid,
            codecValue: block.codecValue,
            hashCodeValue: block.hashCodeValue,
          })),
          nonce,
          client: session.client,
          waitForFinalization: false,
        });

        for (const block of batch) {
          recorder.markSuccess(block);
        }
      } catch (error) {
        recorder.markFailure(error);
        recorder.addNote(
          `batch_all failed on batch ${Math.floor(start / batchSize) + 1}: ${summarizeError(error)}`,
        );
        return recorder.toOutcome(recorder.completedBlocks > 0 ? "partial" : "failure", session.reconnects);
      }
    }

    return recorder.toOutcome("success", session.reconnects);
  } finally {
    destroySession(session);
  }
}

async function executeStrategyWorker(
  strategy: StrategyName,
  options: BenchmarkCliValues,
): Promise<StrategyExecutionResult> {
  const definition = STRATEGIES[strategy];
  const importChunkSizeBytes = definition.importChunkSizeBytes ?? normalizeChunkSizeBytes(options.importChunkSize);
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const resourceSampler = startResourceSampler();

  console.log(`\n▶ ${definition.label}\n`);

  const signerContext = await prepareSigner(options);
  console.log(`  rpc:          ${options.rpc}`);
  console.log(`  substrate:    ${signerContext.accountAddress}`);
  console.log(`  auth:         ${signerContext.resolvedFrom}`);
  console.log(`  account:      ${signerContext.accountName}`);
  console.log(`  input:        ${options.input}`);
  console.log(`  import chunk: ${formatBytes(importChunkSizeBytes)}`);

  await ensureAccountAuthorized(options.rpc, signerContext.accountAddress);

  const dataset = await prepareDataset(options.input!, importChunkSizeBytes);
  console.log(`  dataset:      ${dataset.totalBlocks} block(s), ${formatBytes(dataset.totalBytes)}`);
  console.log(`  root cid:     ${dataset.rootCid}`);

  const outcome = await definition.run({
    dataset,
    signer: signerContext.signer,
    accountAddress: signerContext.accountAddress,
    rpc: options.rpc,
  });

  const finishedAtMs = Date.now();
  const finishedAtIso = new Date(finishedAtMs).toISOString();
  const elapsedMs = Math.max(1, finishedAtMs - startedAtMs);
  const resources = resourceSampler.stop();
  const failedBlocks = Math.max(0, dataset.totalBlocks - outcome.completedBlocks);
  const throughputBytesPerSecond = (outcome.uploadedBytes / elapsedMs) * 1000;
  const transactionsPerSecond = (outcome.completedBlocks / elapsedMs) * 1000;

  console.log(`  status:       ${outcome.status}`);
  console.log(`  elapsed:      ${formatDuration(elapsedMs / 1000)}`);
  console.log(`  completed:    ${outcome.completedBlocks}/${dataset.totalBlocks}`);
  console.log(`  throughput:   ${formatBytes(throughputBytesPerSecond)}/s`);
  console.log(`  tx/s:         ${transactionsPerSecond.toFixed(2)}`);
  console.log(`  peak rss:     ${formatBytes(resources.peakRss)}`);
  console.log(`  peak heap:    ${formatBytes(resources.peakHeapUsed)}`);

  if (outcome.errors.length > 0) {
    console.log("  errors:");
    for (const error of outcome.errors.slice(0, 5)) {
      console.log(`    - ${error.message} (${error.count})`);
    }
  }

  if (outcome.notes.length > 0) {
    console.log("  notes:");
    for (const note of outcome.notes.slice(0, 8)) {
      console.log(`    - ${note}`);
    }
  }

  return {
    strategy,
    label: definition.label,
    description: definition.description,
    status: outcome.status,
    startedAtIso,
    finishedAtIso,
    elapsedMs,
    completedBlocks: outcome.completedBlocks,
    failedBlocks,
    uploadedBytes: outcome.uploadedBytes,
    throughputBytesPerSecond,
    transactionsPerSecond,
    peakRss: resources.peakRss,
    peakHeapUsed: resources.peakHeapUsed,
    cpuUserMicros: resources.cpuUserMicros,
    cpuSystemMicros: resources.cpuSystemMicros,
    reconnects: outcome.reconnects,
    dataset: {
      resolvedPath: dataset.resolvedPath,
      isDirectory: dataset.isDirectory,
      importChunkSizeBytes: dataset.importChunkSizeBytes,
      rootCid: dataset.rootCid,
      totalBlocks: dataset.totalBlocks,
      totalBytes: dataset.totalBytes,
    },
    errors: outcome.errors,
    notes: outcome.notes,
  };
}

function buildWorkerArgs(
  strategy: StrategyName,
  resultFile: string,
  options: BenchmarkCliValues,
): string[] {
  const args = [
    __filename,
    "--worker",
    strategy,
    "--result-file",
    resultFile,
    "--input",
    options.input!,
    "--rpc",
    options.rpc,
    "--account",
    options.account,
    "--password",
    options.password,
    "--timeout-minutes",
    options.timeoutMinutes,
    "--import-chunk-size",
    options.importChunkSize,
  ];

  if (options.keystorePath) {
    args.push("--keystore-path", options.keystorePath);
  }
  if (options.mnemonic) {
    args.push("--mnemonic", options.mnemonic);
  }
  if (options.keyUri) {
    args.push("--key-uri", options.keyUri);
  }

  return args;
}

async function runParent(options: BenchmarkCliValues): Promise<void> {
  const selectedStrategies = expandStrategySelection(options.strategies);
  const timeoutMinutes = normalizeTimeoutMinutes(options.timeoutMinutes);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const outputPath = path.resolve(CLI_ROOT, options.output ?? buildDefaultAggregateOutputPath());
  const outputDir = path.dirname(outputPath);
  await filesystem.mkdir(outputDir, { recursive: true });

  const startedAtIso = new Date().toISOString();
  const results: StrategyExecutionResult[] = [];

  console.log("\n▶ Bulletin Strategy Benchmark\n");
  console.log(`  input:       ${options.input}`);
  console.log(`  rpc:         ${options.rpc}`);
  console.log(`  strategies:  ${selectedStrategies.join(", ")}`);
  console.log(`  timeout:     ${timeoutMinutes} minute(s) per strategy`);
  console.log(`  output:      ${outputPath}\n`);

  for (const strategy of selectedStrategies) {
    const resultFile = path.join(
      outputDir,
      `${path.basename(outputPath, ".json")}-${strategy}.worker.json`,
    );
    const childArgs = buildWorkerArgs(strategy, resultFile, options);
    console.log(`\n▶ Running ${strategy}\n`);

    const child = spawnSync("bun", childArgs, {
      cwd: CLI_ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: CHILD_MAX_BUFFER_BYTES,
      env: process.env,
    });

    if (child.stdout) {
      process.stdout.write(child.stdout);
    }
    if (child.stderr) {
      process.stderr.write(child.stderr);
    }

    if (child.error && child.error.message.toLowerCase().includes("timed out")) {
      const timedOutResult: StrategyExecutionResult = {
        strategy,
        label: STRATEGIES[strategy].label,
        description: STRATEGIES[strategy].description,
        status: "timeout",
        startedAtIso: new Date().toISOString(),
        finishedAtIso: new Date().toISOString(),
        elapsedMs: timeoutMs,
        completedBlocks: 0,
        failedBlocks: 0,
        uploadedBytes: 0,
        throughputBytesPerSecond: 0,
        transactionsPerSecond: 0,
        peakRss: 0,
        peakHeapUsed: 0,
        cpuUserMicros: 0,
        cpuSystemMicros: 0,
        reconnects: 0,
        dataset: {
          resolvedPath: path.resolve(CLI_ROOT, options.input!),
          isDirectory: true,
          importChunkSizeBytes: normalizeChunkSizeBytes(options.importChunkSize),
          rootCid: "",
          totalBlocks: 0,
          totalBytes: 0,
        },
        errors: [{ message: `worker timed out after ${timeoutMinutes} minute(s)`, count: 1 }],
        notes: [],
      };
      results.push(timedOutResult);
      continue;
    }

    if (await fileExists(resultFile)) {
      const parsed = JSON.parse(await filesystem.readFile(resultFile, "utf8")) as StrategyExecutionResult;
      results.push(parsed);
      continue;
    }

    const fallbackError = child.status === 0 ? "worker exited without producing a result file" : `worker exited with status ${child.status}`;
    results.push({
      strategy,
      label: STRATEGIES[strategy].label,
      description: STRATEGIES[strategy].description,
      status: "failure",
      startedAtIso: new Date().toISOString(),
      finishedAtIso: new Date().toISOString(),
      elapsedMs: 0,
      completedBlocks: 0,
      failedBlocks: 0,
      uploadedBytes: 0,
      throughputBytesPerSecond: 0,
      transactionsPerSecond: 0,
      peakRss: 0,
      peakHeapUsed: 0,
      cpuUserMicros: 0,
      cpuSystemMicros: 0,
      reconnects: 0,
      dataset: {
        resolvedPath: path.resolve(CLI_ROOT, options.input!),
        isDirectory: true,
        importChunkSizeBytes: normalizeChunkSizeBytes(options.importChunkSize),
        rootCid: "",
        totalBlocks: 0,
        totalBytes: 0,
      },
      errors: [{ message: fallbackError, count: 1 }],
      notes: [],
    });
  }

  const aggregate: AggregateBenchmarkResult = {
    version: 1,
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    input: path.resolve(CLI_ROOT, options.input!),
    rpc: options.rpc,
    strategies: selectedStrategies,
    outputPath,
    results,
  };

  await filesystem.writeFile(outputPath, JSON.stringify(aggregate, null, 2), "utf8");

  console.log(`\n✓ Aggregate results written to ${outputPath}\n`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await filesystem.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runWorker(options: BenchmarkCliValues): Promise<void> {
  const strategy = options.worker as StrategyName;
  if (!ALL_STRATEGY_NAMES.includes(strategy)) {
    throw new Error(`Unknown worker strategy: ${options.worker}`);
  }
  if (!options.resultFile) {
    throw new Error("Worker mode requires --result-file");
  }

  const result = await executeStrategyWorker(strategy, options);
  const resultPath = path.resolve(CLI_ROOT, options.resultFile);
  await filesystem.mkdir(path.dirname(resultPath), { recursive: true });
  await filesystem.writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
}

async function main(): Promise<void> {
  const options = parseCliValues();

  if (options.help) {
    printHelp();
    return;
  }

  if (options.listStrategies) {
    printStrategies();
    return;
  }

  if (!options.input) {
    throw new Error("Missing required --input <path>");
  }

  if (options.worker) {
    await runWorker(options);
    return;
  }

  await runParent(options);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`\n✗ Error: ${summarizeError(error)}\n`);
    process.exit(1);
  });
}
