import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { concatHex, keccak256, stringToBytes, type Hex } from "viem";
import * as realContext from "../../../src/core/context";
import { deriveDomainTokenId } from "../../../src/utils/contractInteractions";
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

const PASEO_NODE = keccak256(
  concatHex([("0x" + "00".repeat(32)) as Hex, keccak256(stringToBytes("paseo"))]),
);

let availableResult = true;
const reads: string[] = [];

function fakeRead(_ctx: unknown, _address: string, _abi: unknown, functionName: string): unknown {
  reads.push(functionName);
  if (functionName === "available") return availableResult;
  if (functionName === "protocolRegistry") return "0x00000000000000000000000000000000000000ff";
  if (functionName === "tldNode") return PASEO_NODE;
  if (functionName === "tld") return "paseo";
  throw new Error(`unexpected read: ${functionName}`);
}

mock.module("../../../src/core/context", () => ({ ...realContext, read: fakeRead }));

const { computeDomainTokenId, resolveTldInfo, formatDomainName, clearTldInfoCache } =
  await import("../../../src/core/naming");
const { ensureDomainNotRegistered } = await import("../../../src/commands/register");

const namingCtx = {
  contracts: {
    DOTNS_REGISTRAR_CONTROLLER: "0x00000000000000000000000000000000000000aa",
    DOTNS_REGISTRAR: "0x00000000000000000000000000000000000000bb",
  },
} as unknown as realContext.DotnsContext;

describe("TLD ingested from chain", () => {
  beforeEach(() => {
    reads.length = 0;
    clearTldInfoCache();
  });
  afterEach(() => clearTldInfoCache());

  test("resolveTldInfo reads the deployment TLD rather than assuming .dot", async () => {
    expect(await resolveTldInfo(namingCtx)).toEqual({ tldNode: PASEO_NODE, tld: "paseo" });
    expect(reads).toEqual(["protocolRegistry", "tldNode", "tld"]);
  });

  test("the immutable TLD is cached across calls", async () => {
    await resolveTldInfo(namingCtx);
    await resolveTldInfo(namingCtx);
    expect(reads.filter((functionName) => functionName === "tldNode")).toHaveLength(1);
  });

  test("computeDomainTokenId derives the id under the chain TLD", async () => {
    expect(await computeDomainTokenId(namingCtx, "getsome")).toBe(
      deriveDomainTokenId(PASEO_NODE, "getsome"),
    );
  });

  test("formatDomainName uses the deployment TLD suffix", async () => {
    expect(await formatDomainName(namingCtx, "alice")).toBe("alice.paseo");
  });
});

describe("ensureDomainNotRegistered enforces the controller predicate", () => {
  beforeEach(() => {
    reads.length = 0;
    clearTldInfoCache();
  });
  afterEach(() => clearTldInfoCache());

  test("passes when available(label) is true, checking available not ownerOf", async () => {
    availableResult = true;
    await expect(ensureDomainNotRegistered(namingCtx, "alice")).resolves.toBeUndefined();
    expect(reads).toContain("available");
    expect(reads).not.toContain("ownerOf");
  });

  test("throws with the real TLD suffix when available(label) is false", async () => {
    availableResult = false;
    await expect(ensureDomainNotRegistered(namingCtx, "alice")).rejects.toThrow("alice.paseo");
  });
});
