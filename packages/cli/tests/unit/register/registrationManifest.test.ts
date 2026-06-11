import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  saveCommitmentRecord,
  loadCommitmentRecords,
  loadCommitmentRecordsForClear,
  findCommitmentRecord,
  latestCommitmentRecord,
  deleteCommitmentRecord,
  decryptCommitmentSecret,
  resolveManifestCredential,
} from "../../../src/commands/registrationManifest";
import { ENV as CLI_ENV } from "../../../src/cli/env";

const ENV = "paseo-v2";
const CALLER = "0x1111111111111111111111111111111111111111" as const;
const OWNER = "0x2222222222222222222222222222222222222222" as const;
const SECRET = ("0x" + "ab".repeat(32)) as `0x${string}`;
const HASH = ("0x" + "cd".repeat(32)) as `0x${string}`;
const PASSWORD = "correct horse battery staple";

let tempDir: string;

function save(label: string, committedAtIso: string, overrides: Record<string, unknown> = {}) {
  saveCommitmentRecord({
    env: ENV,
    caller: CALLER,
    label,
    owner: OWNER,
    reserved: false,
    governance: false,
    secret: SECRET,
    commitmentHash: HASH,
    committedAtIso,
    credential: PASSWORD,
    ...overrides,
  });
}

beforeAll(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "dotns-reg-manifest-"));
  process.env.DOTNS_REGISTRATION_DIR = tempDir;
});

beforeEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DOTNS_REGISTRATION_DIR;
});

describe("registration manifest persistence", () => {
  test("saves a record and reads it back by label", () => {
    save("coolname", "2026-06-02T12:00:00.000Z");
    const record = findCommitmentRecord(ENV, CALLER, "coolname");
    expect(record).not.toBeNull();
    expect(record?.label).toBe("coolname");
    expect(record?.owner).toBe(OWNER);
    expect(record?.commitmentHash).toBe(HASH);
  });

  test("encrypts the secret at rest (never stored in plaintext)", () => {
    save("coolname", "2026-06-02T12:00:00.000Z");
    const record = findCommitmentRecord(ENV, CALLER, "coolname");
    const serialised = JSON.stringify(record);
    expect(serialised).not.toContain(SECRET);
    expect(record?.encryptedSecret.cipher.name).toBe("aes-256-gcm");
  });

  test("decrypts the secret with the correct credential", () => {
    save("coolname", "2026-06-02T12:00:00.000Z");
    const record = findCommitmentRecord(ENV, CALLER, "coolname")!;
    expect(decryptCommitmentSecret(record, PASSWORD)).toBe(SECRET);
  });

  test("rejects decryption with the wrong credential", () => {
    save("coolname", "2026-06-02T12:00:00.000Z");
    const record = findCommitmentRecord(ENV, CALLER, "coolname")!;
    expect(() => decryptCommitmentSecret(record, "wrong password")).toThrow();
  });

  test("lists records for the env + caller, newest commit first", () => {
    save("older", "2026-06-01T09:00:00.000Z");
    save("newer", "2026-06-03T09:00:00.000Z");
    const records = loadCommitmentRecords(ENV, CALLER);
    expect(records.map((r) => r.label)).toEqual(["newer", "older"]);
    expect(latestCommitmentRecord(ENV, CALLER)?.label).toBe("newer");
  });

  test("isolates records by env and caller", () => {
    save("mine", "2026-06-02T12:00:00.000Z");
    saveCommitmentRecord({
      env: "previewnet",
      caller: CALLER,
      label: "other-env",
      owner: OWNER,
      reserved: false,
      governance: false,
      secret: SECRET,
      commitmentHash: HASH,
      committedAtIso: "2026-06-02T12:00:00.000Z",
      credential: PASSWORD,
    });
    const records = loadCommitmentRecords(ENV, CALLER);
    expect(records.map((r) => r.label)).toEqual(["mine"]);
  });

  test("deletes a record", () => {
    save("coolname", "2026-06-02T12:00:00.000Z");
    deleteCommitmentRecord(ENV, CALLER, "coolname");
    expect(findCommitmentRecord(ENV, CALLER, "coolname")).toBeNull();
  });

  test("returns empty when nothing is cached", () => {
    expect(loadCommitmentRecords(ENV, CALLER)).toEqual([]);
    expect(latestCommitmentRecord(ENV, CALLER)).toBeNull();
  });

  test("clear record selection scopes to a requested label", () => {
    save("alpha", "2026-06-01T09:00:00.000Z");
    save("beta", "2026-06-03T09:00:00.000Z");

    const records = loadCommitmentRecordsForClear(ENV, CALLER, "alpha");

    expect(records.map((record) => record.label)).toEqual(["alpha"]);
  });

  test("clear record selection errors when a requested label is missing", () => {
    save("beta", "2026-06-03T09:00:00.000Z");

    expect(() => loadCommitmentRecordsForClear(ENV, CALLER, "alpha")).toThrow(
      "No cached commitment for alpha.",
    );
    expect(loadCommitmentRecords(ENV, CALLER).map((record) => record.label)).toEqual(["beta"]);
  });
});

describe("resolveManifestCredential", () => {
  test("prefers password, then mnemonic, then key URI", () => {
    expect(resolveManifestCredential({ password: "pw", mnemonic: "m", keyUri: "//Alice" })).toBe(
      "pw",
    );
    expect(resolveManifestCredential({ mnemonic: "m", keyUri: "//Alice" })).toBe("m");
    expect(resolveManifestCredential({ keyUri: "//Alice" })).toBe("//Alice");
  });

  test("returns null when no credential is available", () => {
    const savedPassword = process.env[CLI_ENV.KEYSTORE_PASSWORD];
    const savedMnemonic = process.env[CLI_ENV.MNEMONIC];
    const savedKeyUri = process.env[CLI_ENV.KEY_URI];
    delete process.env[CLI_ENV.KEYSTORE_PASSWORD];
    delete process.env[CLI_ENV.MNEMONIC];
    delete process.env[CLI_ENV.KEY_URI];
    try {
      expect(resolveManifestCredential({})).toBeNull();
    } finally {
      if (savedPassword !== undefined) process.env[CLI_ENV.KEYSTORE_PASSWORD] = savedPassword;
      if (savedMnemonic !== undefined) process.env[CLI_ENV.MNEMONIC] = savedMnemonic;
      if (savedKeyUri !== undefined) process.env[CLI_ENV.KEY_URI] = savedKeyUri;
    }
  });

  test("uses env mnemonic and key URI for registration cache encryption", () => {
    const savedPassword = process.env[CLI_ENV.KEYSTORE_PASSWORD];
    const savedMnemonic = process.env[CLI_ENV.MNEMONIC];
    const savedKeyUri = process.env[CLI_ENV.KEY_URI];
    delete process.env[CLI_ENV.KEYSTORE_PASSWORD];
    try {
      process.env[CLI_ENV.MNEMONIC] = "env mnemonic";
      process.env[CLI_ENV.KEY_URI] = "//EnvAlice";
      expect(resolveManifestCredential({})).toBe("env mnemonic");

      delete process.env[CLI_ENV.MNEMONIC];
      expect(resolveManifestCredential({})).toBe("//EnvAlice");
    } finally {
      if (savedPassword === undefined) delete process.env[CLI_ENV.KEYSTORE_PASSWORD];
      else process.env[CLI_ENV.KEYSTORE_PASSWORD] = savedPassword;
      if (savedMnemonic === undefined) delete process.env[CLI_ENV.MNEMONIC];
      else process.env[CLI_ENV.MNEMONIC] = savedMnemonic;
      if (savedKeyUri === undefined) delete process.env[CLI_ENV.KEY_URI];
      else process.env[CLI_ENV.KEY_URI] = savedKeyUri;
    }
  });
});
