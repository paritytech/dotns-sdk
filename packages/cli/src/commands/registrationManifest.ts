import os from "node:os";
import path from "node:path";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  chmodSync,
} from "node:fs";
import chalk from "chalk";
import type { Address, Hex } from "viem";
import { encryptKeystorePayload, decryptKeystorePayload } from "../cli/keystore/crypto";
import type { DotnsKeystore } from "../cli/keystore/types";
import { formatErrorMessage } from "../utils/formatting";

/**
 * Local, resumable record of a submitted commit-reveal registration.
 *
 * The commit (a hash) is already on-chain; to reveal we must re-supply the
 * original preimage, of which only `secret` is sensitive and unrecoverable. The
 * secret is therefore encrypted at rest with the caller's credential (reusing
 * the keystore's scrypt + AES-256-GCM); everything else is plaintext so the
 * cache can be listed and cleared without unlocking.
 */
export type CommitmentRecord = {
  /** DotNS environment id the commit was submitted on (e.g. "paseo-v2"). */
  env: string;
  /** EVM address that submitted the commit (the cache owner). */
  caller: Address;
  /** Domain label without ".dot". */
  label: string;
  /** EVM address that will own the name once revealed. */
  owner: Address;
  /** The commit-reveal `reserved` field (governance true, or regular --reverse). */
  reserved: boolean;
  /** True when the reveal must use registerReserved (governance) rather than register. */
  governance: boolean;
  /** keccak(label, owner, secret, reserved) as submitted on-chain. */
  commitmentHash: Hex;
  /** Transaction hash of the commit, if known. */
  commitTxHash?: string;
  /** ISO timestamp when the commit was submitted. */
  committedAtIso: string;
  /** Post-mint transfer destination to replay on resume, if any. */
  transferDestination?: string;
  /** Encrypted { secret } payload (scrypt + AES-256-GCM). */
  encryptedSecret: DotnsKeystore;
};

const MANIFEST_EXTENSION = ".json";

function getManifestDirectory(): string {
  const configured = process.env.DOTNS_REGISTRATION_DIR;
  if (configured && configured.trim().length > 0) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), ".dotns", "registrations");
}

/** Filesystem-safe, collision-free id for an (env, caller, label) triple. */
function recordId(env: string, caller: Address, label: string): string {
  return `${env}__${caller.toLowerCase()}__${label.toLowerCase()}`;
}

function recordPath(id: string): string {
  return path.join(getManifestDirectory(), `${id}${MANIFEST_EXTENSION}`);
}

function belongsTo(record: CommitmentRecord, env: string, caller: Address): boolean {
  return record.env === env && record.caller.toLowerCase() === caller.toLowerCase();
}

/**
 * Resolve the passphrase used to lock the stored secret from raw command/env
 * options. Registration flows prefer the credential attached to the resolved
 * auth source so keystore account selection and cache encryption stay aligned.
 */
export function resolveManifestCredential(options: {
  password?: string;
  mnemonic?: string;
  keyUri?: string;
}): string | null {
  return (
    options.password ||
    process.env.DOTNS_KEYSTORE_PASSWORD ||
    options.mnemonic ||
    options.keyUri ||
    process.env.DOTNS_MNEMONIC ||
    process.env.DOTNS_KEY_URI ||
    null
  );
}

export function saveCommitmentRecord(params: {
  env: string;
  caller: Address;
  label: string;
  owner: Address;
  reserved: boolean;
  governance: boolean;
  secret: Hex;
  commitmentHash: Hex;
  commitTxHash?: string;
  transferDestination?: string;
  committedAtIso: string;
  credential: string;
}): void {
  const record: CommitmentRecord = {
    env: params.env,
    caller: params.caller,
    label: params.label,
    owner: params.owner,
    reserved: params.reserved,
    governance: params.governance,
    commitmentHash: params.commitmentHash,
    commitTxHash: params.commitTxHash,
    committedAtIso: params.committedAtIso,
    transferDestination: params.transferDestination,
    encryptedSecret: encryptKeystorePayload({ secret: params.secret }, params.credential),
  };

  const dir = getManifestDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const filePath = recordPath(recordId(params.env, params.caller, params.label));
  writeFileSync(filePath, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}

/** All records for the given env + caller, newest commit first. */
export function loadCommitmentRecords(env: string, caller: Address): CommitmentRecord[] {
  const dir = getManifestDirectory();
  if (!existsSync(dir)) return [];

  const records: CommitmentRecord[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(MANIFEST_EXTENSION)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as CommitmentRecord;
      if (parsed?.label && parsed?.encryptedSecret && belongsTo(parsed, env, caller)) {
        records.push(parsed);
      }
    } catch (error) {
      console.warn(
        chalk.yellow(
          `  ⚠ Skipping unreadable registration cache file ${file}: ${formatErrorMessage(error)}`,
        ),
      );
    }
  }

  return records.sort((a, b) => b.committedAtIso.localeCompare(a.committedAtIso));
}

export function findCommitmentRecord(
  env: string,
  caller: Address,
  label: string,
): CommitmentRecord | null {
  const file = recordPath(recordId(env, caller, label));
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CommitmentRecord;
    return belongsTo(parsed, env, caller) ? parsed : null;
  } catch (error) {
    console.warn(
      chalk.yellow(
        `  ⚠ Could not read cached commitment for ${label}: ${formatErrorMessage(error)}`,
      ),
    );
    return null;
  }
}

export function latestCommitmentRecord(env: string, caller: Address): CommitmentRecord | null {
  return loadCommitmentRecords(env, caller)[0] ?? null;
}

export function loadCommitmentRecordsForClear(
  env: string,
  caller: Address,
  label?: string,
): CommitmentRecord[] {
  if (!label) return loadCommitmentRecords(env, caller);

  const record = findCommitmentRecord(env, caller, label);
  if (!record) {
    throw new Error(`No cached commitment for ${label}.`);
  }

  return [record];
}

export function deleteCommitmentRecord(env: string, caller: Address, label: string): void {
  rmSync(recordPath(recordId(env, caller, label)), { force: true });
}

/** Decrypt and return the reveal secret for a stored commitment. */
export function decryptCommitmentSecret(record: CommitmentRecord, credential: string): Hex {
  const payload = decryptKeystorePayload(record.encryptedSecret, credential) as { secret?: Hex };
  if (!payload?.secret) {
    throw new Error("Stored commitment is missing its secret or the credential is wrong.");
  }
  return payload.secret;
}
