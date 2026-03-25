import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCliReporter, withConsoleToStderr } from "../../../src/cli/reporter";

describe("cli reporter", () => {
  let stderrBuffer = "";
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    stderrBuffer = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrBuffer += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  test("stream reporter emits durable progress lines", () => {
    const reporter = createCliReporter("stream");
    const task = reporter.task("Uploading");

    task.update("Uploading chunk 1");
    task.succeed("Upload complete");
    reporter.warn("Retrying");

    expect(stderrBuffer).toContain("• Uploading\n");
    expect(stderrBuffer).toContain("  Uploading chunk 1\n");
    expect(stderrBuffer).toContain("✓ Upload complete\n");
    expect(stderrBuffer).toContain("! Retrying\n");
  });

  test("withConsoleToStderr redirects console and stdout writes", async () => {
    await withConsoleToStderr(async () => {
      console.log("hello");
      process.stdout.write("world");
    });

    expect(stderrBuffer).toContain("hello\n");
    expect(stderrBuffer).toContain("world");
  });
});
