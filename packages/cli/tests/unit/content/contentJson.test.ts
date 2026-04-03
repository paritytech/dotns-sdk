import { expect, test } from "bun:test";
import {
  HARNESS_HELP_SUCCESS_EXIT_CODE,
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
} from "../../_helpers/cliHelpers";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";

test("content view --help shows --json option", async () => {
  const result = await runDotnsCli(["content", "view", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});

test("content set --help shows --json option", async () => {
  const result = await runDotnsCli(["content", "set", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("--json");
  expect(result.combinedOutput).toContain("Output result as JSON");
});

test("content set --json emits JSON error when both mnemonic and key-uri provided", async () => {
  const result = await runDotnsCli([
    "content",
    "--mnemonic",
    DEFAULT_MNEMONIC,
    "--key-uri",
    "//Alice",
    "set",
    "testdomain",
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "--json",
  ]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const errorOutput = result.standardError.trim();
  const parsed = JSON.parse(errorOutput);
  expect(parsed.error).toContain("Cannot specify both");
});
