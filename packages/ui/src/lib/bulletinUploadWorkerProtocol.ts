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

export type BulletinUploadWorkerRequest = PrepareSliceRequest | PrepareRootRequest;
export type PrepareSliceRequestInput = Omit<PrepareSliceRequest, "id">;
export type PrepareRootRequestInput = Omit<PrepareRootRequest, "id">;
export type BulletinUploadWorkerRequestInput = PrepareSliceRequestInput | PrepareRootRequestInput;

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

export type BulletinUploadWorkerErrorResponse = {
  id: number;
  ok: false;
  error: string;
};

export type BulletinUploadWorkerResponse =
  | PrepareSliceSuccessResponse
  | PrepareRootSuccessResponse
  | BulletinUploadWorkerErrorResponse;

export type BulletinUploadWorkerSuccessResponse =
  | PrepareSliceSuccessResponse
  | PrepareRootSuccessResponse;

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
