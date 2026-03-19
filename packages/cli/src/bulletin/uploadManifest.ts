import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import type {
  UploadManifest,
  UploadManifestCompletedBlock,
  UploadManifestIdentity,
  UploadManifestLoadResult,
} from "../types/types";

const DEFAULT_MANIFEST_DIR = path.join(os.homedir(), ".dotns", "uploads");
const MANIFEST_EXTENSION = ".json";

function getManifestDirectory(): string {
  const configuredDirectory = process.env.DOTNS_UPLOAD_MANIFEST_DIR;
  if (configuredDirectory && configuredDirectory.trim().length > 0) {
    return path.resolve(configuredDirectory);
  }

  return DEFAULT_MANIFEST_DIR;
}

function normalizeCompletedBlock(block: {
  cid?: unknown;
  index?: unknown;
  length?: unknown;
}): UploadManifestCompletedBlock | null {
  if (typeof block.cid !== "string") return null;
  if (typeof block.index !== "number" || !Number.isFinite(block.index)) return null;
  const length =
    typeof block.length === "number" && Number.isFinite(block.length) ? block.length : 0;
  return {
    cid: block.cid,
    index: Math.max(0, Math.floor(block.index)),
    length: Math.max(0, Math.floor(length)),
  };
}

function normalizeManifest(raw: unknown): UploadManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const maybe = raw as Record<string, unknown>;
  const completedRaw = Array.isArray(maybe.completedBlocks) ? maybe.completedBlocks : [];
  const completedBlocks = completedRaw
    .map((item) =>
      normalizeCompletedBlock(item as { cid?: unknown; index?: unknown; length?: unknown }),
    )
    .filter((item): item is UploadManifestCompletedBlock => item !== null)
    .sort((a, b) => a.index - b.index);

  if (typeof maybe.inputPath !== "string") return null;
  if (typeof maybe.chunkSize !== "number") return null;
  if (typeof maybe.totalBlocks !== "number") return null;

  const version = typeof maybe.version === "number" ? maybe.version : 1;
  const createdAtIso =
    typeof maybe.createdAtIso === "string"
      ? maybe.createdAtIso
      : typeof maybe.timestamp === "string"
        ? maybe.timestamp
        : new Date().toISOString();
  const updatedAtIso =
    typeof maybe.updatedAtIso === "string"
      ? maybe.updatedAtIso
      : typeof maybe.timestamp === "string"
        ? maybe.timestamp
        : createdAtIso;

  const fileSize = typeof maybe.fileSize === "number" ? maybe.fileSize : 0;
  const fileMtimeMs = typeof maybe.fileMtimeMs === "number" ? maybe.fileMtimeMs : 0;
  const fingerprint = typeof maybe.fingerprint === "string" ? maybe.fingerprint : "";
  const id = typeof maybe.id === "string" ? maybe.id : "";
  const type = maybe.type === "directory" ? "directory" : "file";
  const rootCid = typeof maybe.rootCid === "string" ? maybe.rootCid : undefined;

  return {
    version: version === 1 ? 1 : 1,
    id,
    fingerprint,
    inputPath: maybe.inputPath,
    fileSize,
    fileMtimeMs,
    chunkSize: Math.max(1, Math.floor(maybe.chunkSize)),
    totalBlocks: Math.max(0, Math.floor(maybe.totalBlocks)),
    completedBlocks,
    rootCid,
    createdAtIso,
    updatedAtIso,
    type,
  };
}

function manifestPathById(id: string): string {
  return path.join(getManifestDirectory(), `${id}${MANIFEST_EXTENSION}`);
}

async function readManifestFile(filePath: string): Promise<UploadManifest | null> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return normalizeManifest(JSON.parse(data));
  } catch {
    return null;
  }
}

function dedupeCompletedBlocks(
  blocks: UploadManifestCompletedBlock[],
): UploadManifestCompletedBlock[] {
  const deduped = new Map<number, UploadManifestCompletedBlock>();
  for (const block of blocks) {
    const previous = deduped.get(block.index);
    if (!previous || block.length >= previous.length) {
      deduped.set(block.index, block);
    }
  }
  return [...deduped.values()].sort((a, b) => a.index - b.index);
}

function ensureManifestIdentity(manifest: UploadManifest): UploadManifest {
  const nowIso = new Date().toISOString();
  const fingerprint =
    manifest.fingerprint ||
    createUploadFingerprint({
      inputPath: manifest.inputPath,
      fileSize: manifest.fileSize,
      fileMtimeMs: manifest.fileMtimeMs,
      chunkSize: manifest.chunkSize,
    });
  const id = manifest.id || fingerprint.slice(0, 16);

  return {
    ...manifest,
    version: 1,
    id,
    fingerprint,
    completedBlocks: dedupeCompletedBlocks(manifest.completedBlocks),
    createdAtIso: manifest.createdAtIso || nowIso,
    updatedAtIso: nowIso,
  };
}

export function createUploadFingerprint(identity: UploadManifestIdentity): string {
  const hashInput = [
    path.resolve(identity.inputPath),
    String(identity.fileSize),
    String(Math.floor(identity.fileMtimeMs)),
    String(identity.chunkSize),
  ].join(":");
  return createHash("sha256").update(hashInput).digest("hex");
}

export function createUploadManifestId(identity: UploadManifestIdentity): string {
  return createUploadFingerprint(identity).slice(0, 16);
}

async function listManifestFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(getManifestDirectory());
    return entries
      .filter((entry) => entry.endsWith(MANIFEST_EXTENSION))
      .map((entry) => path.join(getManifestDirectory(), entry));
  } catch {
    return [];
  }
}

export async function loadManifest(
  target: string | UploadManifestIdentity,
): Promise<UploadManifest | null> {
  if (typeof target === "string") {
    const manifests = await loadManifestsForPath(target);
    return manifests[0] ?? null;
  }

  const id = createUploadManifestId(target);
  const manifest = await readManifestFile(manifestPathById(id));
  if (!manifest) return null;
  const expectedFingerprint = createUploadFingerprint(target);
  if (manifest.fingerprint !== expectedFingerprint) return null;
  return manifest;
}

async function loadManifestsForPath(inputPath: string): Promise<UploadManifest[]> {
  const resolvedPath = path.resolve(inputPath);
  const files = await listManifestFiles();
  const manifests = await Promise.all(files.map((filePath) => readManifestFile(filePath)));
  return manifests
    .filter((manifest): manifest is UploadManifest => !!manifest)
    .filter((manifest) => path.resolve(manifest.inputPath) === resolvedPath)
    .sort(
      (a, b) =>
        Date.parse(b.updatedAtIso || b.createdAtIso) - Date.parse(a.updatedAtIso || a.createdAtIso),
    );
}

export async function loadManifestForResume(
  identity: UploadManifestIdentity,
): Promise<UploadManifestLoadResult> {
  const matched = await loadManifest(identity);
  if (matched) {
    return { manifest: matched, staleManifest: null };
  }
  const stale = (await loadManifestsForPath(identity.inputPath))[0] ?? null;
  return { manifest: null, staleManifest: stale };
}

export async function saveManifest(manifest: UploadManifest): Promise<void> {
  const normalized = ensureManifestIdentity(manifest);
  await fs.mkdir(getManifestDirectory(), { recursive: true });
  const finalPath = manifestPathById(normalized.id);
  const tempPath = `${finalPath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2));
  await fs.rename(tempPath, finalPath);
}

export async function deleteManifest(
  target: string | UploadManifestIdentity | UploadManifest,
): Promise<void> {
  const resolvedPaths: string[] = [];

  if (typeof target === "string") {
    const manifests = await loadManifestsForPath(target);
    for (const manifest of manifests) {
      resolvedPaths.push(manifestPathById(manifest.id));
    }
  } else if ("version" in target) {
    resolvedPaths.push(manifestPathById(target.id));
  } else {
    resolvedPaths.push(manifestPathById(createUploadManifestId(target)));
  }

  await Promise.all(
    resolvedPaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore if already removed
      }
    }),
  );
}

export function completedBlocksFromManifest(
  manifest: UploadManifest,
): Map<number, UploadManifestCompletedBlock> {
  const entries = manifest.completedBlocks.map(
    (block) => [block.index, { index: block.index, cid: block.cid, length: block.length }] as const,
  );
  return new Map(entries);
}

export function completedCidsFromManifest(manifest: UploadManifest): Set<string> {
  return new Set(manifest.completedBlocks.map((block) => block.cid));
}

export async function cleanupStaleManifests(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const now = Date.now();
  const files = await listManifestFiles();
  let removed = 0;

  for (const filePath of files) {
    const manifest = await readManifestFile(filePath);
    if (!manifest) {
      try {
        await fs.unlink(filePath);
        removed++;
      } catch {
        // ignore
      }
      continue;
    }

    const updatedAt = Date.parse(manifest.updatedAtIso || manifest.createdAtIso);
    const age = Number.isFinite(updatedAt) ? now - updatedAt : maxAgeMs + 1;
    if (age > maxAgeMs) {
      try {
        await fs.unlink(filePath);
        removed++;
      } catch {
        // ignore
      }
    }
  }

  return removed;
}
