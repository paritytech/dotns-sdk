import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createUploadProfiler,
  createProfileFingerprint,
  buildDefaultProfileOutputPath,
} from "../../../src/cli/commands/bulletin";

describe("upload profiler", () => {
  test("writes schema-complete profile report with peak aggregation", async () => {
    const outputPath = path.join(
      "/tmp",
      `dotns-profile-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );

    const profiler = createUploadProfiler({
      sourcePath: "/tmp/example.bin",
      sourceSizeBytes: 10 * 1024,
      chunkSizeBytes: 512 * 1024,
      rpc: "wss://paseo-bulletin-rpc.polkadot.io",
      initialConcurrency: 1,
      maxConcurrency: 4,
      outputPath,
      jsonOutput: true,
    });

    profiler.onSchedulerState({
      timestampMs: Date.now(),
      window: 1,
      inFlightBytes: 512 * 1024,
      inFlightChunks: 1,
      completedChunks: 1,
      retries: 0,
    });

    profiler.onWave({
      wave: 1,
      startedAtMs: Date.now() - 500,
      endedAtMs: Date.now(),
      durationMs: 500,
      window: 1,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      retries: 0,
      wasClean: true,
    });

    profiler.onSchedulerState({
      timestampMs: Date.now(),
      window: 2,
      inFlightBytes: 0,
      inFlightChunks: 0,
      completedChunks: 2,
      retries: 1,
    });

    const { report, outputPath: writtenPath } = await profiler.finalize("bafyprofilecid");
    const onDisk = JSON.parse(await fs.readFile(writtenPath, "utf8"));

    expect(onDisk.meta.sourcePath).toBe("/tmp/example.bin");
    expect(Array.isArray(onDisk.samples)).toBe(true);
    expect(Array.isArray(onDisk.waves)).toBe(true);
    expect(onDisk.summary.finalCid).toBe("bafyprofilecid");

    const peakHeapFromSamples = Math.max(...report.samples.map((sample) => sample.heapUsed));
    expect(report.summary.peakHeapUsed).toBe(peakHeapFromSamples);
    expect(report.samples.length).toBeGreaterThan(0);
  });

  test("default profile path is deterministic for a given fingerprint", () => {
    const fingerprint = createProfileFingerprint("/tmp/file:1024:524288");
    const outputPath = buildDefaultProfileOutputPath("/tmp/file", fingerprint);

    expect(outputPath).toContain(".dotns/upload-profiles");
    expect(outputPath).toContain(fingerprint);
  });
});
