import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ALICE_KEY_URI, HARNESS_SUCCESS_EXIT_CODE, runDotnsCli } from "../../_helpers/cliHelpers";
import { generateRandomLabel } from "../../../src/cli/labels";
import { ProofOfPersonhoodStatus } from "../../../src/types/types";
import { prepareReadOnlyContext } from "../../../src/cli/commands/lookup";
import { findCommitmentRecord } from "../../../src/commands/registrationManifest";

const RETRY_TEST_TIMEOUT_MS = 5 * 60_000;
const PERSIST_DEADLINE_MS = 150_000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let registrationDir: string;

beforeAll(() => {
  registrationDir = mkdtempSync(path.join(os.tmpdir(), "dotns-retry-itest-"));
  process.env.DOTNS_REGISTRATION_DIR = registrationDir;
});

afterAll(() => {
  rmSync(registrationDir, { recursive: true, force: true });
  delete process.env.DOTNS_REGISTRATION_DIR;
});

test(
  "register retry resumes after register domain is interrupted before reveal",
  async () => {
    const readOnly = await prepareReadOnlyContext({ keyUri: ALICE_KEY_URI });
    const env = readOnly.environment;
    if (!env) throw new Error("Test context is missing an environment id");
    const caller = readOnly.evmAddress as `0x${string}`;
    const label = generateRandomLabel(ProofOfPersonhoodStatus.NoStatus);

    // Drive the real registration, then exit during the commitment-age countdown:
    // the commit has landed on-chain and the production persist hook has cached
    // the secret, but the reveal has not run. A genuine crashed registration.
    const child = Bun.spawn(
      [
        "bun",
        "run",
        "src/cli/index.ts",
        "register",
        "domain",
        "--name",
        label,
        "--key-uri",
        ALICE_KEY_URI,
      ],
      {
        env: { ...process.env, DOTNS_REGISTRATION_DIR: registrationDir },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const deadline = Date.now() + PERSIST_DEADLINE_MS;
    let cached = false;
    while (Date.now() < deadline) {
      if (findCommitmentRecord(env, caller, label)) {
        cached = true;
        break;
      }
      if (child.exitCode !== null) break;
      await delay(750);
    }
    child.kill("SIGKILL");
    await child.exited.catch(() => undefined);

    // The real flow committed on-chain and cached the secret before we killed it.
    expect(cached).toBe(true);

    // The reveal was interrupted, so the name is not registered yet.
    const before = await runDotnsCli(["lookup", "owner-of", label]);
    expect(before.combinedOutput).toContain("Registered:");
    expect(before.combinedOutput).toContain("false");

    // Resume the reveal from the cached commitment.
    const retry = await runDotnsCli(["register", "retry", label, "--key-uri", ALICE_KEY_URI]);
    expect(retry.exitCode).toBe(HARNESS_SUCCESS_EXIT_CODE);
    expect(retry.combinedOutput).not.toContain("✗ Error:");
    expect(retry.combinedOutput).toContain("Resuming");

    // The name is now registered and the cached commitment has been cleared.
    const after = await runDotnsCli(["lookup", "owner-of", label]);
    expect(after.combinedOutput).toContain("Registered:");
    expect(after.combinedOutput).toContain("true");
    expect(findCommitmentRecord(env, caller, label)).toBeNull();
  },
  RETRY_TEST_TIMEOUT_MS,
);
