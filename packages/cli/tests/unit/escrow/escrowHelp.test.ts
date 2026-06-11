import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("root help lists escrow command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("escrow");
});

test("escrow help shows the subcommand description and subcommands", async () => {
  const result = await runDotnsCli(["escrow", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Manage NoStatus deposits");
  expect(result.combinedOutput).toContain("status");
  expect(result.combinedOutput).toContain("balance");
  expect(result.combinedOutput).toContain("positions");
  expect(result.combinedOutput).toContain("release");
  expect(result.combinedOutput).toContain("withdraw");
  expect(result.combinedOutput).toContain("claim-withdrawal");
  expect(result.combinedOutput).toContain("refunds");
});

test("escrow balance help describes the claimable pull-payment balance", async () => {
  const result = await runDotnsCli(["escrow", "balance", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("claimable pull-payment balance");
  expect(result.combinedOutput).toContain("--recipient");
});

test("escrow positions help describes the list and total", async () => {
  const result = await runDotnsCli(["escrow", "positions", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("List all escrow positions");
  expect(result.combinedOutput).toContain("total");
  expect(result.combinedOutput).toContain("--recipient");
});

test("escrow status help describes the read-only position lookup", async () => {
  const result = await runDotnsCli(["escrow", "status", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Show the escrow release position");
  expect(result.combinedOutput).toContain("--json");
});

test("escrow release help describes the approve-and-release sequence", async () => {
  const result = await runDotnsCli(["escrow", "release", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Approve the escrow");
  expect(result.combinedOutput).toContain("--json");
});

test("escrow withdraw help describes the post-cooldown step", async () => {
  const result = await runDotnsCli(["escrow", "withdraw", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Move a released deposit");
  expect(result.combinedOutput).toContain("pull-payment ledger");
});

test("escrow claim-withdrawal help describes the overpayment ledger", async () => {
  const result = await runDotnsCli(["escrow", "claim-withdrawal", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Drain the pull-payment ledger");
  expect(result.combinedOutput).toContain("overpayment");
});

test("escrow refunds help lists list/claim/claim-batch", async () => {
  const result = await runDotnsCli(["escrow", "refunds", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("refund ledger");
  expect(result.combinedOutput).toContain("list");
  expect(result.combinedOutput).toContain("claim");
  expect(result.combinedOutput).toContain("claim-batch");
});

test("escrow refunds list help exposes pagination options", async () => {
  const result = await runDotnsCli(["escrow", "refunds", "list", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("--recipient");
  expect(result.combinedOutput).toContain("--offset");
  expect(result.combinedOutput).toContain("--limit");
});

test("escrow refunds claim help requires an entry id positional", async () => {
  const result = await runDotnsCli(["escrow", "refunds", "claim", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("<entryId>");
  expect(result.combinedOutput).toContain("cooldown");
});

test("escrow refunds claim-batch help accepts variadic ids", async () => {
  const result = await runDotnsCli(["escrow", "refunds", "claim-batch", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("<ids...>");
  expect(result.combinedOutput).toContain("one transaction");
});
