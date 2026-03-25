import type { CompletedChunk } from "./bulletinUpload";

export type PreparedBlock = {
  cid: string;
  bytes: Uint8Array;
};

export type PreparedChunk = {
  cid: string;
  bytes: Uint8Array;
  length: number;
};

export type FolderFileEntry = {
  relativePath: string;
  content: ArrayBuffer;
};

export type PrepareSliceRequest = {
  id: number;
  type: "prepare-slice";
  file: File;
  start: number;
  end: number;
  codec: number;
};

export type PrepareRootRequest = {
  id: number;
  type: "prepare-root";
  chunks: CompletedChunk[];
};

export type PrepareFolderCarRequest = {
  id: number;
  type: "prepare-folder-car";
  files: FolderFileEntry[];
};

export type BulletinUploadWorkerRequest =
  | PrepareSliceRequest
  | PrepareRootRequest
  | PrepareFolderCarRequest;
export type PrepareSliceRequestInput = Omit<PrepareSliceRequest, "id">;
export type PrepareRootRequestInput = Omit<PrepareRootRequest, "id">;
export type PrepareFolderCarRequestInput = Omit<PrepareFolderCarRequest, "id">;
export type BulletinUploadWorkerRequestInput =
  | PrepareSliceRequestInput
  | PrepareRootRequestInput
  | PrepareFolderCarRequestInput;

export type PrepareSliceSuccessResponse = {
  id: number;
  ok: true;
  type: "prepare-slice";
  cid: string;
  buffer: ArrayBufferLike;
  length: number;
};

export type PrepareRootSuccessResponse = {
  id: number;
  ok: true;
  type: "prepare-root";
  cid: string;
  buffer: ArrayBufferLike;
  length: number;
};

export type MerkleisedBlock = {
  cid: string;
  codec: number;
  hashCode: number;
  buffer: ArrayBufferLike;
  length: number;
};

export type PrepareFolderCarSuccessResponse = {
  id: number;
  ok: true;
  type: "prepare-folder-car";
  rootCid: string;
  blocks: MerkleisedBlock[];
  totalBytes: number;
};

export type BulletinUploadWorkerErrorResponse = {
  id: number;
  ok: false;
  error: string;
};

export type BulletinUploadWorkerResponse =
  | PrepareSliceSuccessResponse
  | PrepareRootSuccessResponse
  | PrepareFolderCarSuccessResponse
  | BulletinUploadWorkerErrorResponse;

export type BulletinUploadWorkerSuccessResponse =
  | PrepareSliceSuccessResponse
  | PrepareRootSuccessResponse
  | PrepareFolderCarSuccessResponse;

export type StorePreparedResult = {
  cid: string;
  length: number;
};

export type PendingUploadInfo = {
  fileName: string;
  completedChunks: number;
  totalChunks: number;
};

export type ApprovalStep = {
  key: string;
  label: string;
  shortLabel: string;
};
