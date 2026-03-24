import type {
  BulletinUploadWorkerRequest,
  BulletinUploadWorkerRequestInput,
  BulletinUploadWorkerResponse,
  PrepareRootSuccessResponse,
  PrepareSliceSuccessResponse,
} from "./bulletinUploadWorkerProtocol";
import type { CompletedChunk } from "./bulletinUpload";

type PendingRequest = {
  resolve: (response: PrepareSliceSuccessResponse | PrepareRootSuccessResponse) => void;
  reject: (error: Error) => void;
};

export class BulletinUploadWorkerClient {
  private worker: Worker;
  private nextRequestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private destroyed = false;

  constructor() {
    this.worker = new Worker(new URL("../workers/bulletinUpload.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = this.handleMessage;
    this.worker.onerror = (event) => {
      this.rejectAll(
        new Error(event.message || "Background upload worker failed while preparing data."),
      );
    };
    this.worker.onmessageerror = () => {
      this.rejectAll(new Error("Background upload worker returned an unreadable message."));
    };
  }

  async prepareFile(file: File, codec: number): Promise<{ cid: string; bytes: Uint8Array }> {
    return this.prepareSlice(file, 0, file.size, codec);
  }

  async prepareSlice(
    file: File,
    start: number,
    end: number,
    codec: number,
  ): Promise<{ cid: string; bytes: Uint8Array; length: number }> {
    const response = await this.post({
      type: "prepare-slice",
      file,
      start,
      end,
      codec,
    });

    return {
      cid: response.cid,
      bytes: new Uint8Array(response.buffer),
      length: response.length,
    };
  }

  async prepareRoot(
    chunks: CompletedChunk[],
  ): Promise<{ cid: string; bytes: Uint8Array; length: number }> {
    const response = await this.post({
      type: "prepare-root",
      chunks,
    });

    return {
      cid: response.cid,
      bytes: new Uint8Array(response.buffer),
      length: response.length,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.worker.terminate();
    this.rejectAll(new Error("Upload preparation was cancelled."));
  }

  private post(
    message: BulletinUploadWorkerRequestInput,
  ): Promise<PrepareSliceSuccessResponse | PrepareRootSuccessResponse> {
    if (this.destroyed) {
      return Promise.reject(new Error("Upload worker is no longer available."));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const request: BulletinUploadWorkerRequest = { ...message, id };
      this.worker.postMessage(request);
    });
  }

  private handleMessage = (event: MessageEvent<BulletinUploadWorkerResponse>): void => {
    const response = event.data;
    const pendingRequest = this.pendingRequests.get(response.id);

    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (!response.ok) {
      pendingRequest.reject(new Error(response.error));
      return;
    }

    pendingRequest.resolve(response);
  };

  private rejectAll(error: Error): void {
    const requests = [...this.pendingRequests.values()];
    this.pendingRequests.clear();
    for (const request of requests) {
      request.reject(error);
    }
  }
}
