import path from "node:path";
import { promises as fsp } from "node:fs";
import type { DotnsKeystore } from "./types";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readKeystoreFile(keystorePath: string): Promise<DotnsKeystore> {
  const raw = await fsp.readFile(keystorePath, "utf8");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Keystore is not valid JSON");
  }
  return parsed as DotnsKeystore;
}

export async function writeKeystoreFile(keystorePath: string, ks: DotnsKeystore): Promise<void> {
  await fsp.mkdir(path.dirname(keystorePath), { recursive: true });
  const tmp = `${keystorePath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(ks, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, keystorePath);
}

export async function deleteKeystoreFile(keystorePath: string): Promise<void> {
  if (await pathExists(keystorePath)) await fsp.unlink(keystorePath);
}
