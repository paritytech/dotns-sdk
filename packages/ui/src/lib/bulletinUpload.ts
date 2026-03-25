import { CID } from "multiformats/cid";
import { create as createMultihashDigest } from "multiformats/hashes/digest";
import { sha256 } from "@noble/hashes/sha2.js";
import type { PreparedBlock } from "./bulletinUploadWorkerProtocol";

export const BULLETIN_RPC = "wss://paseo-bulletin-rpc.polkadot.io";
export const MAX_TX_SIZE = 8 * 1024 * 1024;
export const CHUNK_SIZE = 2 * 1024 * 1024;
export const MAX_BROWSER_UPLOAD_SIZE = 5 * 1024 * 1024;
export const BROWSER_FOLDER_LIMIT = 5 * 1024 * 1024;
export const CODEC_RAW = 0x55;
export const CODEC_DAG_PB = 0x70;
export const HASH_SHA2_256 = 0x12;

export type CompletedChunk = {
  index: number;
  cid: string;
  length: number;
};

export type UploadApprovalPlan = {
  needsChunking: boolean;
  chunkCount: number;
  contentApprovalCount: number;
  rootApprovalCount: number;
  storeApprovalCount: number;
  totalApprovalCount: number;
};

type DagRootBuilder = {
  dagPbModule: typeof import("@ipld/dag-pb");
  UnixFS: typeof import("ipfs-unixfs").UnixFS;
};

let dagRootBuilder: Promise<DagRootBuilder> | null = null;

export function createCid(data: Uint8Array, codec: number): CID {
  const hash = sha256(data);
  const multihash = createMultihashDigest(HASH_SHA2_256, hash);
  return CID.createV1(codec, multihash);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function getUploadApprovalPlan(fileSize: number): UploadApprovalPlan {
  const needsChunking = fileSize > MAX_TX_SIZE;
  const chunkCount = needsChunking ? Math.ceil(fileSize / CHUNK_SIZE) : 0;
  const contentApprovalCount = needsChunking ? chunkCount : 1;
  const rootApprovalCount = needsChunking ? 1 : 0;
  const storeApprovalCount = 1;

  return {
    needsChunking,
    chunkCount,
    contentApprovalCount,
    rootApprovalCount,
    storeApprovalCount,
    totalApprovalCount: contentApprovalCount + rootApprovalCount + storeApprovalCount,
  };
}

export function isBrowserUploadSizeAllowed(fileSize: number): boolean {
  return fileSize <= MAX_BROWSER_UPLOAD_SIZE;
}

async function getDagRootBuilder() {
  dagRootBuilder ??= Promise.all([import("@ipld/dag-pb"), import("ipfs-unixfs")]).then(
    ([dagPbModule, unixFsModule]) => ({
      dagPbModule,
      UnixFS: unixFsModule.UnixFS,
    }),
  );

  return dagRootBuilder;
}

export async function createDagRoot(completedChunks: CompletedChunk[]): Promise<PreparedBlock> {
  const { dagPbModule, UnixFS } = await getDagRootBuilder();
  const blockSizes = completedChunks.map((chunk) => BigInt(chunk.length));
  const unixfsFileData = new UnixFS({ type: "file", blockSizes });

  const dagPbNode = dagPbModule.prepare({
    Data: unixfsFileData.marshal(),
    Links: completedChunks.map((chunk) => ({
      Name: "",
      Tsize: chunk.length,
      Hash: CID.parse(chunk.cid),
    })),
  });

  const bytes = dagPbModule.encode(dagPbNode);
  return {
    cid: createCid(bytes, CODEC_DAG_PB).toString(),
    bytes,
  };
}
