import crypto from "node:crypto";
import type { DotnsKeystore } from "./types";

function b64(buf: Buffer): string {
  return buf.toString("base64");
}
function fromB64(s: string): Buffer {
  return Buffer.from(s, "base64");
}

function scryptKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
  keyLen: number,
): Buffer {
  return crypto.scryptSync(password, salt, keyLen, {
    cost,
    blockSize,
    parallelization,
    maxmem: 128 * 1024 * 1024,
  }) as Buffer;
}

export function encryptKeystorePayload(payload: object, password: string): DotnsKeystore {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const cost = 1 << 15;
  const blockSize = 8;
  const parallelization = 1;
  const keyLen = 32;

  const key = scryptKey(password, salt, cost, blockSize, parallelization, keyLen);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    kdf: {
      name: "scrypt",
      saltB64: b64(salt),
      cost,
      blockSize,
      parallelization,
      keyLen,
    },
    cipher: {
      name: "aes-256-gcm",
      ivB64: b64(iv),
      tagB64: b64(tag),
    },
    ciphertextB64: b64(ciphertext),
    createdAtIso: new Date().toISOString(),
  };
}

export function decryptKeystorePayload(ks: DotnsKeystore, password: string): any {
  if (ks.version !== 1) throw new Error(`Unsupported keystore version: ${ks.version}`);
  if (ks.kdf.name !== "scrypt") throw new Error(`Unsupported kdf: ${ks.kdf.name}`);
  if (ks.cipher.name !== "aes-256-gcm") throw new Error(`Unsupported cipher: ${ks.cipher.name}`);

  const salt = fromB64(ks.kdf.saltB64);
  const iv = fromB64(ks.cipher.ivB64);
  const tag = fromB64(ks.cipher.tagB64);
  const ciphertext = fromB64(ks.ciphertextB64);

  const key = scryptKey(
    password,
    salt,
    ks.kdf.cost,
    ks.kdf.blockSize,
    ks.kdf.parallelization,
    ks.kdf.keyLen,
  );

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Invalid keystore password");
  }

  try {
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Corrupt keystore payload");
  }
}
