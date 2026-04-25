import { expect, test } from "bun:test";
import {
  HARNESS_SUCCESS_EXIT_CODE,
  ALICE_KEY_URI,
  runDotnsCli,
  expectJsonHelpOption,
} from "../../_helpers/cliHelpers";

test("register domain --help shows --json option", () =>
  expectJsonHelpOption(["register", "domain"]));

test("register subname --help shows --json option", () =>
  expectJsonHelpOption(["register", "subname"]));

test("register domain --json emits JSON error when --transfer without --to", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--name",
    "testlabel",
    "--transfer",
    "--key-uri",
    ALICE_KEY_URI,
    "--json",
  ]);

  expect(result.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);

  const errorOutput = result.standardError.trim();
  const parsed = JSON.parse(errorOutput);
  expect(parsed.error).toContain("Missing transfer destination");
});
