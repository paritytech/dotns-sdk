import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  completedBlocksFromManifest,
  createUploadManifestId,
  deleteManifest,
  loadManifestForResume,
  saveManifest,
} from "../../../src/bulletin/uploadManifest";
import type { UploadManifestIdentity } from "../../../src/types/types";

const createdIdentities: UploadManifestIdentity[] = [];
const manifestTestDirectory = path.join(
  "/tmp",
  `dotns-upload-manifest-tests-${process.pid}-${Date.now()}`,
);

function makeIdentity(seed: string): UploadManifestIdentity {
  const identity: UploadManifestIdentity = {
    inputPath: `/tmp/dotns-upload-${seed}-${Date.now()}-${Math.random()}`,
    fileSize: 1024,
    fileMtimeMs: 1_700_000_000_000,
    chunkSize: 512 * 1024,
  };
  createdIdentities.push(identity);
  return identity;
}

afterEach(async () => {
  await Promise.all(createdIdentities.map((identity) => deleteManifest(identity)));
  createdIdentities.length = 0;
  rmSync(manifestTestDirectory, { recursive: true, force: true });
  delete process.env.DOTNS_UPLOAD_MANIFEST_DIR;
});

beforeEach(() => {
  mkdirSync(manifestTestDirectory, { recursive: true });
  process.env.DOTNS_UPLOAD_MANIFEST_DIR = manifestTestDirectory;
});

describe("upload manifest resume behavior", () => {
  test("returns stale manifest when fingerprint does not match", async () => {
    const identity = makeIdentity("resume");
    const manifestId = createUploadManifestId(identity);

    await saveManifest({
      version: 1,
      id: manifestId,
      fingerprint: "",
      inputPath: identity.inputPath,
      fileSize: identity.fileSize,
      fileMtimeMs: identity.fileMtimeMs,
      chunkSize: identity.chunkSize,
      totalBlocks: 2,
      completedBlocks: [{ index: 0, cid: "cid-0", length: 512 }],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      type: "file",
    });

    const mismatchResult = await loadManifestForResume({
      ...identity,
      fileMtimeMs: identity.fileMtimeMs + 1000,
    });

    expect(mismatchResult.manifest).toBeNull();
    expect(mismatchResult.staleManifest).not.toBeNull();
    expect(mismatchResult.staleManifest?.inputPath).toBe(identity.inputPath);
  });

  test("deduplicates completed blocks by index", async () => {
    const identity = makeIdentity("dedupe");
    const manifestId = createUploadManifestId(identity);

    await saveManifest({
      version: 1,
      id: manifestId,
      fingerprint: "",
      inputPath: identity.inputPath,
      fileSize: identity.fileSize,
      fileMtimeMs: identity.fileMtimeMs,
      chunkSize: identity.chunkSize,
      totalBlocks: 2,
      completedBlocks: [
        { index: 0, cid: "cid-0", length: 100 },
        { index: 0, cid: "cid-0", length: 200 },
        { index: 1, cid: "cid-1", length: 300 },
      ],
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString(),
      type: "file",
    });

    const loaded = await loadManifestForResume(identity);
    expect(loaded.manifest).not.toBeNull();

    const map = completedBlocksFromManifest(loaded.manifest!);
    expect(map.size).toBe(2);
    expect(map.get(0)?.length).toBe(200);
    expect(map.get(1)?.cid).toBe("cid-1");
  });
});
