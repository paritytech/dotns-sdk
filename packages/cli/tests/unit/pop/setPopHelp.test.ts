import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("root help lists pop command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("pop");
});

test("pop help shows commands and description", async () => {
  const result = await runDotnsCli(["pop", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("ProofOfPersonhood status lookup");
  expect(result.combinedOutput).toContain("info|status [options]");
  expect(result.combinedOutput).toContain("personhood");
  expect(result.combinedOutput).toContain("precompile");
});

test("pop help shows auth options", async () => {
  const result = await runDotnsCli(["pop", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("--rpc <wsUrl>");
  expect(result.combinedOutput).toContain("--keystore-path <path>");
  expect(result.combinedOutput).toContain("--account <name>");
  expect(result.combinedOutput).toContain("--password <pw>");
  expect(result.combinedOutput).toContain("--mnemonic <phrase>");
  expect(result.combinedOutput).toContain("--key-uri <uri>");
});

test("pop info help shows description", async () => {
  const result = await runDotnsCli(["pop", "info", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Usage: dotns pop info");
  expect(result.combinedOutput).toContain("Display ProofOfPersonhood status");
});

test("pop status help shows description", async () => {
  const result = await runDotnsCli(["pop", "status", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Usage: dotns pop info");
  expect(result.combinedOutput).toContain("personhood precompile");
});

test("pop info help shows auth options", async () => {
  const result = await runDotnsCli(["pop", "info", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("--rpc <wsUrl>");
  expect(result.combinedOutput).toContain("--keystore-path <path>");
  expect(result.combinedOutput).toContain("--account <name>");
  expect(result.combinedOutput).toContain("--password <pw>");
  expect(result.combinedOutput).toContain("--mnemonic <phrase>");
  expect(result.combinedOutput).toContain("--key-uri <uri>");
});

test("pop info parses auth options at pop level", async () => {
  const result = await runDotnsCli([
    "pop",
    "--account",
    "test",
    "--password",
    "pass",
    "info",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("pop info parses auth options at info level", async () => {
  const result = await runDotnsCli([
    "pop",
    "info",
    "--account",
    "test",
    "--password",
    "pass",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("pop help command shows pop help", async () => {
  const result = await runDotnsCli(["pop", "help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("ProofOfPersonhood status lookup");
});

test("pop help status shows info help", async () => {
  const result = await runDotnsCli(["pop", "help", "status"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Usage: dotns pop info");
});

test("pop help info shows info help", async () => {
  const result = await runDotnsCli(["pop", "help", "info"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("Usage: dotns pop info");
});
