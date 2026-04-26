import { expect, test } from "bun:test";
import {
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  runDotnsCli,
  expectJsonHelpOption,
} from "../../_helpers/cliHelpers";
import { DEFAULT_MNEMONIC } from "../../../src/utils/constants";

test("text view --help shows --json option", () => expectJsonHelpOption(["text", "view"]));

test("text set --help shows --json option", () => expectJsonHelpOption(["text", "set"]));

test("text set --json emits JSON error when both mnemonic and key-uri provided", async () => {
  const result = await runDotnsCli([
    "text",
    "--mnemonic",
    DEFAULT_MNEMONIC,
    "--key-uri",
    ALICE_KEY_URI,
    "set",
    "testdomain",
    "test-key",
    "test-value",
    "--json",
  ]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const errorOutput = result.standardError.trim();
  const parsed = JSON.parse(errorOutput);
  expect(parsed.error).toContain("Cannot specify both");
});
