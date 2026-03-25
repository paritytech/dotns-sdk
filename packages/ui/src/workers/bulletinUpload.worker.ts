/// <reference lib="webworker" />

import type { CID } from "multiformats/cid";
import { createCid, createDagRoot } from "../lib/bulletinUpload";
import type {
  BulletinUploadWorkerErrorResponse,
  BulletinUploadWorkerRequest,
  BulletinUploadWorkerResponse,
  FolderFileEntry,
} from "../lib/bulletinUploadWorkerProtocol";

const workerScope = self as DedicatedWorkerGlobalScope;

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof FileReaderSync !== "undefined") {
    const reader = new FileReaderSync();
    return new Uint8Array(reader.readAsArrayBuffer(blob));
  }

  return new Uint8Array(await blob.arrayBuffer());
}

import type { MerkleisedBlock } from "../lib/bulletinUploadWorkerProtocol";

async function merkleiseFolder(
  files: FolderFileEntry[],
): Promise<{ rootCid: string; blocks: MerkleisedBlock[]; totalBytes: number }> {
  const { importer } = await import("ipfs-unixfs-importer");

  const blockEntries = new Map<string, { cid: CID; bytes: Uint8Array }>();

  const blockstore = {
    put: async (cid: CID, bytes: Uint8Array) => {
      blockEntries.set(cid.toString(), { cid, bytes });
      return cid;
    },
    get: async (cid: CID) => {
      const block = blockEntries.get(cid.toString());
      if (!block) throw new Error(`Block not found: ${cid}`);
      return block.bytes;
    },
  };

  async function* importerSource() {
    for (const file of files) {
      yield {
        path: file.relativePath,
        content: new Uint8Array(file.content),
      };
    }
  }

  let rootCid: CID | undefined;

  for await (const entry of importer(importerSource(), blockstore, {
    wrapWithDirectory: true,
    cidVersion: 1,
    rawLeaves: true,
  })) {
    rootCid = entry.cid;
  }

  if (!rootCid) {
    throw new Error("Merkleisation produced no root CID");
  }

  let totalBytes = 0;
  const blocks: MerkleisedBlock[] = [];

  for (const [, block] of blockEntries) {
    const buffer = block.bytes.buffer.slice(
      block.bytes.byteOffset,
      block.bytes.byteOffset + block.bytes.byteLength,
    );
    blocks.push({
      cid: block.cid.toString(),
      codec: block.cid.code,
      hashCode: block.cid.multihash.code,
      buffer,
      length: block.bytes.byteLength,
    });
    totalBytes += block.bytes.byteLength;
  }

  blockEntries.clear();

  return { rootCid: rootCid.toString(), blocks, totalBytes };
}

function postError(id: number, error: unknown): void {
  const message = error instanceof Error ? error.message : "Failed to prepare upload data.";
  workerScope.postMessage({
    id,
    ok: false,
    error: message,
  } satisfies BulletinUploadWorkerErrorResponse);
}

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<BulletinUploadWorkerRequest>) => {
    const message = event.data;

    try {
      if (message.type === "prepare-slice") {
        const bytes = await readBlobBytes(message.file.slice(message.start, message.end));
        const buffer = bytes.buffer;

        workerScope.postMessage(
          {
            id: message.id,
            ok: true,
            type: "prepare-slice",
            cid: createCid(bytes, message.codec).toString(),
            buffer,
            length: bytes.byteLength,
          } satisfies BulletinUploadWorkerResponse,
          [buffer],
        );
        return;
      }

      if (message.type === "prepare-root") {
        const root = await createDagRoot(message.chunks);
        const buffer = root.bytes.buffer;

        workerScope.postMessage(
          {
            id: message.id,
            ok: true,
            type: "prepare-root",
            cid: root.cid,
            buffer,
            length: root.bytes.byteLength,
          } satisfies BulletinUploadWorkerResponse,
          [buffer],
        );
        return;
      }

      if (message.type === "prepare-folder-car") {
        const { rootCid, blocks, totalBytes } = await merkleiseFolder(message.files);
        const transferables = blocks.map((b) => b.buffer);

        workerScope.postMessage(
          {
            id: message.id,
            ok: true,
            type: "prepare-folder-car",
            rootCid,
            blocks,
            totalBytes,
          } satisfies BulletinUploadWorkerResponse,
          transferables,
        );
        return;
      }
    } catch (error) {
      postError(message.id, error);
    }
  },
);
