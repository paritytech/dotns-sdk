/// <reference lib="webworker" />

import { createCid, createDagRoot } from "../lib/bulletinUpload";
import type {
  BulletinUploadWorkerErrorResponse,
  BulletinUploadWorkerRequest,
  BulletinUploadWorkerResponse,
} from "../lib/bulletinUploadWorkerProtocol";

const workerScope = self as DedicatedWorkerGlobalScope;

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof FileReaderSync !== "undefined") {
    const reader = new FileReaderSync();
    return new Uint8Array(reader.readAsArrayBuffer(blob));
  }

  return new Uint8Array(await blob.arrayBuffer());
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
    } catch (error) {
      postError(message.id, error);
    }
  },
);
