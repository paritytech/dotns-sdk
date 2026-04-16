import { expect, test } from "bun:test";
import {
  HARNESS_SUCCESS_EXIT_CODE,
  runDotnsCli,
  expectJsonHelpOption,
} from "../../_helpers/cliHelpers";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";

test("content view --help shows --json option", () => expectJsonHelpOption(["content", "view"]));

test("content set --help shows --json option", () => expectJsonHelpOption(["content", "set"]));

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
