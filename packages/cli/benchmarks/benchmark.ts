#!/usr/bin/env bun

import { parseArgs } from "util";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const DEFAULT_SIZES = ["1MB", "8MB", "32MB", "128MB", "256MB", "512MB", "1GB"];
const DEFAULT_RPC = "wss://paseo-bulletin-rpc.polkadot.io";
const DEFAULT_TIMEOUT_MINUTES = 60;

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
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: false,
});

const runTimeoutMs = Math.max(1, Number(values["timeout-minutes"] || DEFAULT_TIMEOUT_MINUTES)) * 60 * 1000;

if (values.help) {
  console.log(`
Usage: bun benchmarks/benchmark.ts [options]

Runs upload benchmarks using CLI profiling JSON reports.

Options:
  --sizes <list>       Comma-separated sizes (default: ${DEFAULT_SIZES.join(",")})
  --concurrency <n>    Initial max window seed (default: 3)
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

function runUpload(filePath: string, profilePath: string): { stdout: string; report: ProfileReport } {
  const args = [
    "run",
    "dev",
    "bulletin",
    "upload",
    filePath,
    "--password",
    String(values.password),
    "--account",
    String(values.account),
    "--bulletin-rpc",
    String(values.rpc),
    "--force-chunked",
    "--concurrency",
    String(values.concurrency),
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
    const stderrTail = (result.stderr ?? "").trim().split("\n").slice(-10).join("\n");
    const stdoutTail = (result.stdout ?? "").trim().split("\n").slice(-10).join("\n");
    const diagnostic = [
      result.error.message,
      stderrTail ? `\n--- stderr (last 10 lines) ---\n${stderrTail}` : "",
      stdoutTail ? `\n--- stdout (last 10 lines) ---\n${stdoutTail}` : "",
    ].join("");
    throw new Error(diagnostic);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "Unknown CLI failure";
    throw new Error(stderr.split("\n")[0]);
  }

  const report = JSON.parse(readFileSync(profilePath, "utf8")) as ProfileReport;
  return { stdout: result.stdout ?? "", report };
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

const results: BenchmarkResult[] = [];

console.log("\n▶ Bulletin Upload Benchmark (profile-driven)\n");
console.log(`  rpc:         ${values.rpc}`);
console.log(`  sizes:       ${sizes.map((size) => size.label).join(", ")}`);
console.log(`  scheduler:   adaptive (seed max=${values.concurrency})`);
console.log(`  run timeout: ${Math.round(runTimeoutMs / 60_000)} minutes\n`);

for (const entry of sizes) {
  const filePath = join(tempDir, `test-${entry.label}.dat`);
  const profilePath = join(profileDir, `profile-${entry.label}.json`);

  console.log(`  Generating ${entry.label} (${humanSize(entry.sizeBytes)})...`);
  generateTestFile(filePath, entry.sizeBytes);

  console.log(`  Uploading ${entry.label}...`);
  try {
    const { stdout, report } = runUpload(filePath, profilePath);
    const jsonLine = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .at(-1);

    const parsedOutput = jsonLine ? JSON.parse(jsonLine) : null;
    const elapsedMs = report.summary.elapsedMs;
    const throughputMBps = report.summary.throughputBytesPerSecond / 1024 / 1024;
    const peakHeapMB = report.summary.peakHeapUsed / 1024 / 1024;
    const peakRssMB = report.summary.peakRss / 1024 / 1024;

    results.push({
      label: entry.label,
      sizeBytes: entry.sizeBytes,
      success: true,
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
      `  ✓ ${entry.label} — ${(elapsedMs / 1000).toFixed(1)}s | ${throughputMBps.toFixed(2)} MB/s | heap ${peakHeapMB.toFixed(0)} MB`,
    );
  } catch (error: any) {
    const message = String(error?.message ?? error).split("\n")[0] ?? "Unknown failure";
    results.push({
      label: entry.label,
      sizeBytes: entry.sizeBytes,
      success: false,
      error: message,
      profilePath,
    });

    console.log(`  ✗ ${entry.label} — ${message}`);
  }

  console.log();
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const consolidatedResultPath = join(resultsDir, `${timestamp}.json`);
writeFileSync(
  consolidatedResultPath,
  JSON.stringify(
    {
      createdAtIso: new Date().toISOString(),
      rpc: values.rpc,
      concurrencySeed: Number(values.concurrency),
      timeoutMs: runTimeoutMs,
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

if (!values["keep-files"]) {
  rmSync(tempDir, { recursive: true, force: true });
  console.log(`  Cleaned up ${tempDir}`);
}

const passed = results.filter((result) => result.success).length;
console.log(`\n✓ ${passed}/${results.length} passed\n`);

process.exit(passed === results.length ? 0 : 1);
