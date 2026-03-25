import { afterEach, expect, test } from "bun:test";
import { HARNESS_HELP_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";
import {
  getCommitmentBufferSeconds,
  COMMITMENT_POLL_INTERVAL_MS,
  COMMITMENT_POLL_TIMEOUT_MS,
} from "../../../src/utils/constants";

afterEach(() => {
  delete process.env.DOTNS_COMMITMENT_BUFFER;
});

test("root help lists register command", async () => {
  const result = await runDotnsCli(["--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
  expect(result.combinedOutput).toContain("register");
});

test("register help shows subcommands", async () => {
  const result = await runDotnsCli(["register", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Domain registration commands");
  expect(result.combinedOutput).toContain("domain");
  expect(result.combinedOutput).toContain("subname");
});

test("register domain help shows options", async () => {
  const result = await runDotnsCli(["register", "domain", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Register a new base domain");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--status");
  expect(result.combinedOutput).toContain("--reverse");
  expect(result.combinedOutput).toContain("--governance");
  expect(result.combinedOutput).toContain("--owner");
  expect(result.combinedOutput).toContain("--transfer");
  expect(result.combinedOutput).toContain("--to");
  expect(result.combinedOutput).toContain("--commitment-buffer");
  expect(result.combinedOutput).toContain("DOTNS_COMMITMENT_BUFFER");
});

test("register subname help shows options", async () => {
  const result = await runDotnsCli(["register", "subname", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);

  expect(result.combinedOutput).toContain("Register a subname under an existing domain");
  expect(result.combinedOutput).toContain("--name");
  expect(result.combinedOutput).toContain("--parent");
  expect(result.combinedOutput).toContain("--owner");
});

test("register domain parses status none", async () => {
  const result = await runDotnsCli(["register", "domain", "--status", "none", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses status lite", async () => {
  const result = await runDotnsCli(["register", "domain", "--status", "lite", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses status full", async () => {
  const result = await runDotnsCli(["register", "domain", "--status", "full", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses reverse flag", async () => {
  const result = await runDotnsCli(["register", "domain", "--reverse", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses governance flag", async () => {
  const result = await runDotnsCli(["register", "domain", "--governance", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses owner option", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--owner",
    "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses transfer with destination", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--transfer",
    "--to",
    "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses account option", async () => {
  const result = await runDotnsCli(["register", "domain", "--account", "alice", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses keystore-path option", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--keystore-path",
    "/tmp/keystore",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses password option", async () => {
  const result = await runDotnsCli(["register", "domain", "--password", "test-password", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses mnemonic option", async () => {
  const result = await runDotnsCli([
    "register",
    "domain",
    "--mnemonic",
    "bottom drive obey lake curtain smoke basket hold race lonely fit walk",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses key-uri option", async () => {
  const result = await runDotnsCli(["register", "domain", "--key-uri", "//Alice", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses commitment-buffer option", async () => {
  const result = await runDotnsCli(["register", "domain", "--commitment-buffer", "12", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register domain parses commitment-buffer alias --cb", async () => {
  const result = await runDotnsCli(["register", "domain", "--cb", "10", "--help"]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register subname parses name and parent", async () => {
  const result = await runDotnsCli([
    "register",
    "subname",
    "--name",
    "pr18",
    "--parent",
    "claude",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("register subname parses owner option", async () => {
  const result = await runDotnsCli([
    "register",
    "subname",
    "--name",
    "pr18",
    "--parent",
    "claude",
    "--owner",
    "0x3Cd0A705a2DC65e5b1E1205896BaA2be8A07c6e0",
    "--help",
  ]);
  expect(result.exitCode).toBe(HARNESS_HELP_SUCCESS_EXIT_CODE);
});

test("getCommitmentBufferSeconds defaults to 6 when env is not set", () => {
  delete process.env.DOTNS_COMMITMENT_BUFFER;
  expect(getCommitmentBufferSeconds()).toBe(6);
});

test("getCommitmentBufferSeconds reads from DOTNS_COMMITMENT_BUFFER env variable", () => {
  process.env.DOTNS_COMMITMENT_BUFFER = "12";
  expect(getCommitmentBufferSeconds()).toBe(12);
});

test("COMMITMENT_POLL_INTERVAL_MS is 2000", () => {
  expect(COMMITMENT_POLL_INTERVAL_MS).toBe(2_000);
});

test("COMMITMENT_POLL_TIMEOUT_MS is 30000", () => {
  expect(COMMITMENT_POLL_TIMEOUT_MS).toBe(30_000);
});
