import { expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";

test("governance --help lists propose and status", async () => {
  const result = await runDotnsCli(["governance", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("OpenGov");
  expect(result.combinedOutput).toContain("propose");
  expect(result.combinedOutput).toContain("status");
});

test("governance propose --help shows every option", async () => {
  const result = await runDotnsCli(["governance", "propose", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  for (const option of [
    "<name>",
    "--for",
    "--reason",
    "--track",
    "--decision-deposit",
    "--dry-run",
    "--json",
  ]) {
    expect(result.combinedOutput).toContain(option);
  }
});

test("governance status --help takes a name or --referendum", async () => {
  const result = await runDotnsCli(["governance", "status", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("[name]");
  expect(result.combinedOutput).toContain("--referendum");
});

test("whitelist request --help requires a reason", async () => {
  const result = await runDotnsCli(["whitelist", "request", "--help"]);

  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("<name>");
  expect(result.combinedOutput).toContain("--reason");
  expect(result.combinedOutput).toContain("--for");
});

// Both guards run before any chain context is prepared, so they need no network.
test("governance propose refuses --json without --dry-run", async () => {
  const result = await runDotnsCli(["governance", "propose", "web3", "--json"]);

  expect(result.exitCode).not.toBe(0);
  expect(result.combinedOutput).toContain("--json only works with --dry-run");
});

test("governance propose refuses to sign without an interactive terminal", async () => {
  const wasTty = process.stdin.isTTY;
  (process.stdin as any).isTTY = false;
  try {
    const result = await runDotnsCli(["governance", "propose", "web3"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.combinedOutput).toContain("without an interactive terminal");
  } finally {
    (process.stdin as any).isTTY = wasTty;
  }
});

test("governance propose rejects an unknown track", async () => {
  const result = await runDotnsCli(["governance", "propose", "web3", "--track", "treasurer"]);

  expect(result.exitCode).not.toBe(0);
  expect(result.combinedOutput).toContain('Unknown track "treasurer"');
});
