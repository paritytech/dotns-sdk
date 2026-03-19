#!/usr/bin/env bun

import { parseArgs } from "util";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const DEFAULT_SIZES = ["500KB", "1MB", "5MB", "10MB", "50MB", "100MB", "500MB", "1GB"];
const DEFAULT_RPC = "wss://paseo-bulletin-rpc.polkadot.io";
const DEFAULT_TIMEOUT_MINUTES = 120;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    sizes: { type: "string", default: DEFAULT_SIZES.join(",") },
    "keep-files": { type: "boolean", default: false },
    password: { type: "string", default: "123456" },
    account: { type: "string", default: "alice" },
    concurrency: { type: "string", default: "3" },
    rpc: { type: "string", default: DEFAULT_RPC },
    "heap-limit-mb": { type: "string", default: "512" },
    "timeout-minutes": { type: "string", default: String(DEFAULT_TIMEOUT_MINUTES) },
    "max-attempts": { type: "string", default: "8" },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: false,
});

const runTimeoutMs = Math.max(1, Number(values["timeout-minutes"] || DEFAULT_TIMEOUT_MINUTES)) * 60 * 1000;
const maxAttempts = Math.max(1, Math.floor(Number(values["max-attempts"] || 8)));

if (values.help) {
  console.log(`
Usage: bun benchmarks/benchmark.ts [options]

Runs upload benchmarks using CLI profiling JSON reports.

Options:
  --sizes <list>       Comma-separated sizes (default: ${DEFAULT_SIZES.join(",")})
  --concurrency <n>    Initial max window seed (default: 3)
  --max-attempts <n>   Attempts per size with --resume (default: 8)
  --rpc <wsUrl>        Bulletin RPC endpoint (default: ${DEFAULT_RPC})
  --password <pw>      Keystore password (default: 123456)
  --account <name>     Keystore account (default: alice)
  --heap-limit-mb <n>  Node heap limit passed via NODE_OPTIONS (default: 512)
  --timeout-minutes <n> Per-upload timeout in minutes (default: 60)
  --keep-files         Keep generated files after run
  --help, -h           Show this message
`);
  process.exit(0);
}

function parseSize(raw: string): number {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match || !match[1]) {
    throw new Error(`Cannot parse size: "${raw}"`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
  };

  return Math.floor(value * (multipliers[unit] ?? 1));
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function generateTestFile(filePath: string, sizeBytes: number): void {
  const chunkSize = 64 * 1024;
  const writer = Bun.file(filePath).writer();
  const buf = new Uint8Array(chunkSize);
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = (i * 13 + 29) & 0xff;
  }

  let written = 0;
  while (written < sizeBytes) {
    const remaining = sizeBytes - written;
    const slice = remaining < chunkSize ? buf.subarray(0, remaining) : buf;
    writer.write(slice);
    written += slice.length;
  }

  writer.end();
}

type ProfileReport = {
  summary: {
    totalUploadTimeMs: number;
    totalUploadTimeSeconds: number;
    elapsedMs: number;
    throughputBytesPerSecond: number;
    peakHeapUsed: number;
    peakRss: number;
    retryCount: number;
    maxWindowReached: number;
    finalCid: string;
  };
};

type BenchmarkResult = {
  label: string;
  sizeBytes: number;
  success: boolean;
  attempts: number;
  attemptFailures?: AttemptFailure[];
  totalUploadTimeMs?: number;
  totalUploadTimeSeconds?: number;
  elapsedMs?: number;
  throughputMBps?: number;
  peakHeapMB?: number;
  peakRssMB?: number;
  retries?: number;
  maxWindow?: number;
  cid?: string;
  profilePath?: string;
  error?: string;
};

type AttemptFailure = {
  attempt: number;
  message: string;
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stderrTail?: string;
  stdoutTail?: string;
};

type UploadRunError = Error & AttemptFailure;

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function tailOutput(output: string | undefined, maxLines = 20): string | undefined {
  const lines = (output ?? "")
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) return undefined;
  return lines.slice(-maxLines).join("\n");
}

function parseFailureMessage(stderr: string, stdout: string): string {
  const lines = `${stderr}\n${stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    try {
      const parsed = JSON.parse(line) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
      if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
    } catch {
      // ignore non-JSON lines
    }
  }

  const informative = lines.find(
    (line) =>
      !line.startsWith("$ bun run") &&
      !line.startsWith("error: script") &&
      !line.startsWith("Bun v"),
  );
  return informative || "Unknown CLI failure";
}

function runUpload(filePath: string, profilePath: string): { stdout: string; report: ProfileReport } {
  const args = [
    "run",
    "dev",
    "bulletin",
    "upload",
    filePath,
    "--key-uri",
    "//Alice",
    "--bulletin-rpc",
    String(values.rpc),
    "--force-chunked",
    "--concurrency",
    String(values.concurrency),
    "--resume",
    "--profile-upload",
    "--profile-output",
    profilePath,
    "--no-history",
    "--json",
  ];

  const result = spawnSync("bun", args, {
    cwd: resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: runTimeoutMs,
    env: {
      ...process.env,
      NODE_OPTIONS: `--max-old-space-size=${values["heap-limit-mb"]}`,
    },
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    const stderrTail = tailOutput(result.stderr ?? "", 10);
    const stdoutTail = tailOutput(result.stdout ?? "", 10);
    const diagnostic = [
      result.error.message,
      stderrTail ? `\n--- stderr (last 10 lines) ---\n${stderrTail}` : "",
      stdoutTail ? `\n--- stdout (last 10 lines) ---\n${stdoutTail}` : "",
    ].join("");
    throw new Error(diagnostic);
  }

  if (result.status !== 0) {
    const message = parseFailureMessage(result.stderr ?? "", result.stdout ?? "");
    throw Object.assign(new Error(message), {
      message,
      status: result.status,
      signal: result.signal,
      stderrTail: tailOutput(result.stderr ?? ""),
      stdoutTail: tailOutput(result.stdout ?? ""),
    } satisfies Partial<UploadRunError>);
  }

  const report = JSON.parse(readFileSync(profilePath, "utf8")) as ProfileReport;
  return { stdout: result.stdout ?? "", report };
}

function runUploadWithRetries(
  filePath: string,
  profilePath: string,
): { stdout: string; report: ProfileReport; attempts: number; failures: AttemptFailure[] } {
  let lastError: UploadRunError | null = null;
  const failures: AttemptFailure[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = runUpload(filePath, profilePath);
      return { ...result, attempts: attempt, failures };
    } catch (error) {
      const typedError = error as UploadRunError;
      lastError = typedError;
      failures.push({
        attempt,
        message: typedError.message,
        status: typedError.status,
        signal: typedError.signal,
        stderrTail: typedError.stderrTail,
        stdoutTail: typedError.stdoutTail,
      });
      if (attempt >= maxAttempts) break;
      const backoffMs = Math.min(10_000, 1_000 * attempt);
      console.log(`    retry ${attempt}/${maxAttempts - 1} after failure: ${typedError.message}`);
      if (typedError.stderrTail || typedError.stdoutTail) {
        const stderrSummary = typedError.stderrTail
          ? `stderr tail:\n${typedError.stderrTail}`
          : undefined;
        const stdoutSummary = typedError.stdoutTail
          ? `stdout tail:\n${typedError.stdoutTail}`
          : undefined;
        console.log(
          [stderrSummary, stdoutSummary].filter(Boolean).join("\n\n"),
        );
      }
      sleep(backoffMs);
    }
  }

  if (lastError) {
    throw Object.assign(lastError, { failures });
  }

  throw new Error("Upload failed");
}

const sizes = String(values.sizes)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((label) => ({ label, sizeBytes: parseSize(label) }));

const tempDir = resolve(".benchmark-temp");
const resultsDir = resolve(__dirname, "results");
const profileDir = join(tempDir, "profiles");
mkdirSync(tempDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });
mkdirSync(resultsDir, { recursive: true });
const benchmarkStartedAtMs = Date.now();

const results: BenchmarkResult[] = [];

console.log("\n▶ Bulletin Upload Benchmark (profile-driven)\n");
console.log(`  rpc:         ${values.rpc}`);
console.log(`  sizes:       ${sizes.map((size) => size.label).join(", ")}`);
console.log(`  scheduler:   adaptive (seed max=${values.concurrency})`);
console.log(`  max attempts:${maxAttempts}`);
console.log(`  run timeout: ${Math.round(runTimeoutMs / 60_000)} minutes\n`);

for (const entry of sizes) {
  const filePath = join(tempDir, `test-${entry.label}.dat`);
  const profilePath = join(profileDir, `profile-${entry.label}.json`);

  console.log(`  Generating ${entry.label} (${humanSize(entry.sizeBytes)})...`);
  generateTestFile(filePath, entry.sizeBytes);

  console.log(`  Uploading ${entry.label}...`);
  try {
    const { stdout, report, attempts, failures } = runUploadWithRetries(filePath, profilePath);
    const jsonLine = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    const parsedOutput = jsonLine ? JSON.parse(jsonLine) : null;
    const totalUploadTimeMs = Math.max(
      1,
      report.summary.totalUploadTimeMs ?? report.summary.elapsedMs,
    );
    const elapsedMs = totalUploadTimeMs;
    const throughputMBps = report.summary.throughputBytesPerSecond / 1024 / 1024;
    const peakHeapMB = report.summary.peakHeapUsed / 1024 / 1024;
    const peakRssMB = report.summary.peakRss / 1024 / 1024;

    results.push({
      label: entry.label,
      sizeBytes: entry.sizeBytes,
      success: true,
      attempts,
      attemptFailures: failures.length > 0 ? failures : undefined,
      totalUploadTimeMs,
      totalUploadTimeSeconds: totalUploadTimeMs / 1000,
      elapsedMs,
      throughputMBps,
      peakHeapMB,
      peakRssMB,
      retries: report.summary.retryCount,
      maxWindow: report.summary.maxWindowReached,
      cid: parsedOutput?.cid ?? report.summary.finalCid,
      profilePath,
    });

    console.log(
      `  ✓ ${entry.label} — ${(elapsedMs / 1000).toFixed(1)}s | ${throughputMBps.toFixed(2)} MB/s | heap ${peakHeapMB.toFixed(0)} MB | attempts ${attempts}`,
    );
  } catch (error: any) {
    const message = String(error?.message ?? error).split("\n")[0] ?? "Unknown failure";
    results.push({
      label: entry.label,
      sizeBytes: entry.sizeBytes,
      success: false,
      attempts: maxAttempts,
      attemptFailures: Array.isArray(error?.failures) ? error.failures : undefined,
      error: message,
      profilePath,
    });

    console.log(`  ✗ ${entry.label} — ${message}`);
  }

  console.log();
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const consolidatedResultPath = join(resultsDir, `${timestamp}.json`);
const benchmarkFinishedAtMs = Date.now();
const totalElapsedMs = Math.max(1, benchmarkFinishedAtMs - benchmarkStartedAtMs);
const successCount = results.filter((result) => result.success).length;
const failureCount = results.length - successCount;
const totalUploadTimeMs = results.reduce((sum, result) => sum + (result.totalUploadTimeMs ?? 0), 0);
writeFileSync(
  consolidatedResultPath,
  JSON.stringify(
    {
      startedAtIso: new Date(benchmarkStartedAtMs).toISOString(),
      finishedAtIso: new Date(benchmarkFinishedAtMs).toISOString(),
      totalElapsedMs,
      totalElapsedSeconds: totalElapsedMs / 1000,
      createdAtIso: new Date().toISOString(),
      rpc: values.rpc,
      concurrencySeed: Number(values.concurrency),
      maxAttempts,
      timeoutMs: runTimeoutMs,
      successfulUploads: successCount,
      failedUploads: failureCount,
      totalUploadTimeMs,
      totalUploadTimeSeconds: totalUploadTimeMs / 1000,
      sizes,
      results,
    },
    null,
    2,
  ),
  "utf8",
);

console.log("\n  ┌──────────┬──────────┬──────────┬───────────┬──────────┬────────┐");
console.log("  │ Size     │ Time     │ MB/s     │ Heap (MB) │ Retries  │ Window │");
console.log("  ├──────────┼──────────┼──────────┼───────────┼──────────┼────────┤");
for (const result of results) {
  if (result.success) {
    console.log(
      `  │ ${result.label.padEnd(8)} │ ${(Number(result.elapsedMs) / 1000).toFixed(1).padStart(6)}s │ ${Number(result.throughputMBps).toFixed(2).padStart(8)} │ ${Number(result.peakHeapMB).toFixed(0).padStart(9)} │ ${String(result.retries).padStart(8)} │ ${String(result.maxWindow).padStart(6)} │`,
    );
  } else {
    console.log(`  │ ${result.label.padEnd(8)} │   FAIL   │     —    │        —  │        — │      — │`);
  }
}
console.log("  └──────────┴──────────┴──────────┴───────────┴──────────┴────────┘\n");

console.log(`  Saved consolidated results: ${consolidatedResultPath}`);
console.log(`  Total upload time (successful runs): ${(totalUploadTimeMs / 1000).toFixed(1)}s`);
console.log(`  Total benchmark time: ${(totalElapsedMs / 1000).toFixed(1)}s`);

if (!values["keep-files"]) {
  rmSync(tempDir, { recursive: true, force: true });
  console.log(`  Cleaned up ${tempDir}`);
}

const passed = successCount;
console.log(`\n✓ ${passed}/${results.length} passed\n`);

process.exit(passed === results.length ? 0 : 1);
