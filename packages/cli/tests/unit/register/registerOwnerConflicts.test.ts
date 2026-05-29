import { expect, test } from "bun:test";
import { runDotnsCli, TEST_OWNER_EVM_ADDRESS } from "../../_helpers/cliHelpers";

// These guards reject mutually-exclusive flag combinations before any chain
// context is prepared, so they fail fast and require no signer.

test("register domain rejects --owner with --transfer", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--owner",
    TEST_OWNER_EVM_ADDRESS,
    "--transfer",
    "--to",
    TEST_OWNER_EVM_ADDRESS,
  ]);
  expect(result.exitCode).not.toBe(0);
  expect(result.combinedOutput).toContain("Cannot combine --owner with --transfer/--to");
});

test("register domain rejects --owner with --reverse", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--owner",
    TEST_OWNER_EVM_ADDRESS,
    "--reverse",
  ]);
  expect(result.exitCode).not.toBe(0);
  expect(result.combinedOutput).toContain("Cannot combine --owner with --reverse");
});

test("register domain rejects --owner with --governance", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--owner",
    TEST_OWNER_EVM_ADDRESS,
    "--governance",
  ]);
  expect(result.exitCode).not.toBe(0);
  expect(result.combinedOutput).toContain("Cannot combine --owner with --governance");
});
