import { defineStore } from "pinia";
import { ref } from "vue";
import { getPreimageManager } from "@parity/product-sdk-host";
import { useUserStoreManager } from "./useUserStoreManager";
import type { BulletinUploadResult } from "@/type";
import { verifyCidWithGateways, type CidVerificationResult } from "@/lib/ipfs";
import {
  CHUNK_SIZE,
  CODEC_RAW,
  MAX_BROWSER_UPLOAD_SIZE,
  MAX_TX_SIZE,
  formatBytes,
  getFileKey,
  getUploadApprovalPlan,
  isBrowserUploadSizeAllowed,
  type CompletedChunk,
} from "@/lib/bulletinUpload";
import type {
  PendingUploadInfo,
  PreparedChunk,
  StorePreparedResult,
} from "@/lib/bulletinUploadWorkerProtocol";
import { BulletinUploadWorkerClient } from "@/lib/bulletinUploadWorker";

const UPLOAD_GLOBAL_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [200, 400, 800] as const;
const RELEASES_URL = "https://github.com/paritytech/dotns-sdk/releases";

type UploadStage =
  | "idle"
  | "preparing"
  | "signing"
  | "broadcasting"
  | "included"
  | "chunking"
  | "building-root"
  | "verifying"
  | "caching"
  | "done"
  | "error";

function formatTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("cancelled") || lower.includes("rejected") || lower.includes("denied")) {
    return "Transaction was rejected in your wallet. You can try again when ready — completed chunks are saved.";
  }

  if (lower.includes("expired") || lower.includes("expir")) {
    return `Your Bulletin authorisation has expired. Re-authorise with: dotns bulletin authorize <your-address>`;
  }

  if (lower.includes("payment") && lower.includes("balance")) {
    return "Insufficient balance on the Bulletin chain. The Bulletin chain has no currency — ensure your account is authorised.";
  }

  if (
    lower.includes("payment") ||
    lower.includes("unauthorized") ||
    lower.includes("notauthorized")
  ) {
    return `Account not authorised for Bulletin storage. Install the CLI from ${RELEASES_URL} and run: dotns bulletin authorize <your-address>`;
  }

  if (lower.includes("baddatasize") || lower.includes("toomanytransactions")) {
    return "Transaction rejected by the chain. The file may be too large or the chain is busy. Try again later.";
  }

  return message;
}

function ensureError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error("Unknown error");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

const RESUME_STORAGE_KEY = "dotns.bulletin.resume";

interface ResumeState {
  fileKey: string;
  totalChunks: number;
  completedChunks: CompletedChunk[];
}

function saveResumeState(state: ResumeState): void {
  try {
    sessionStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[BulletinStore] Failed to save resume state:", error);
  }
}

function loadResumeState(fileKey: string): ResumeState | null {
  try {
    const raw = sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const state: ResumeState = JSON.parse(raw);
    if (state.fileKey !== fileKey) return null;
    return state;
  } catch (error) {
    console.warn("[BulletinStore] Failed to load resume state:", error);
    return null;
  }
}

function clearResumeState(): void {
  try {
    sessionStorage.removeItem(RESUME_STORAGE_KEY);
  } catch (error) {
    console.warn("[BulletinStore] Failed to clear resume state:", error);
  }
}

function getPendingResumeState(): ResumeState | null {
  try {
    const raw = sessionStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResumeState;
  } catch (error) {
    console.warn("[BulletinStore] Failed to read pending resume state:", error);
    return null;
  }
}

function getPendingUploadInfo(): PendingUploadInfo | null {
  const state = getPendingResumeState();
  if (!state || state.completedChunks.length === 0) return null;
  const fileName = state.fileKey.split(":")[0] ?? "Unknown file";
  return {
    fileName,
    completedChunks: state.completedChunks.length,
    totalChunks: state.totalChunks,
  };
}

export const useBulletinStore = defineStore("useBulletinStore", () => {
  const isUploading = ref(false);
  const uploadProgress = ref(0);
  const uploadStage = ref<UploadStage>("idle");
  const uploadError = ref<string | null>(null);
  const statusMessage = ref("");
  const uploadedCid = ref<string | null>(null);
  const uploadVerification = ref<CidVerificationResult | null>(null);
  const chunksCompleted = ref(0);
  const chunksTotal = ref(0);
  const storeTransactionHash = ref<string | null>(null);
  const cachingEnabled = ref(false);

  function resetUploadState(): void {
    isUploading.value = false;
    uploadProgress.value = 0;
    uploadStage.value = "idle";
    uploadError.value = null;
    statusMessage.value = "";
    uploadedCid.value = null;
    uploadVerification.value = null;
    chunksCompleted.value = 0;
    chunksTotal.value = 0;
    storeTransactionHash.value = null;
    cachingEnabled.value = false;
    window.onbeforeunload = null;
  }

  function getGatewayHost(gatewayUrl: string): string {
    if (!gatewayUrl.includes("://")) return gatewayUrl;
    try {
      return new URL(gatewayUrl).host;
    } catch (error) {
      console.warn("[BulletinStore] Failed to parse gateway URL:", gatewayUrl, error);
      return gatewayUrl;
    }
  }

  function setStage(stage: UploadStage, message: string, progress: number): void {
    uploadStage.value = stage;
    statusMessage.value = message;
    uploadProgress.value = Math.round(progress);
  }

  const RETRYABLE_ERROR_MARKERS = [
    "stale",
    "ancientbirthblock",
    "timeout",
    "timed out",
    "store-timeout",
    "temporarily",
    "connection",
    "not connected",
    "network",
    "socket",
    "ws",
    "websocket",
    "rpc",
    "pool",
    "mempool",
    "priority",
    "future",
    "dropped",
    "reset",
    "econn",
    "unavailable",
    "chainhead disjointed",
    "chainhead stopped",
    "rate limit",
    "stop-call",
    "not pinned",
    "halt",
    "aborted",
    "terminated",
    "resource temporarily unavailable",
  ];

  async function verifyUploadedCid(cid: string): Promise<boolean> {
    setStage("verifying", "Verifying content is retrievable from IPFS gateways...", 95);

    const gatewayResult = await verifyCidWithGateways(cid).catch(
      (): CidVerificationResult => ({ cid, gateway: "", url: "", resolvable: false }),
    );

    if (gatewayResult.resolvable) {
      uploadVerification.value = gatewayResult;
      setStage(
        "verifying",
        `Verified — content retrievable via ${getGatewayHost(gatewayResult.gateway)}`,
        96,
      );
      return true;
    }

    uploadVerification.value = { cid, gateway: "", url: "", resolvable: false };
    setStage(
      "verifying",
      "Content stored on Bulletin but not yet retrievable from IPFS gateways. " +
        "It may take time to propagate, or run: dotns bulletin verify " +
        cid,
      96,
    );
    return false;
  }

  async function verifyAndCacheUpload(
    cid: string,
    options: { cacheToStore?: boolean },
  ): Promise<void> {
    const verified = await verifyUploadedCid(cid);

    if (verified && options.cacheToStore) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setStage("caching", "Approve saving the CID to your Store", 97);
      const userStoreManager = useUserStoreManager();
      try {
        const txHash = await userStoreManager.writeCidToStore(cid);
        storeTransactionHash.value = txHash;
      } catch (cacheError) {
        console.warn("[BulletinStore] CID caching failed, upload still succeeded:", cacheError);
      }
    } else {
      setStage(
        "verifying",
        `Content uploaded but not yet resolvable. Verify with: dotns bulletin verify ${cid}`,
        96,
      );
    }
  }

  function isRetryableError(error: unknown): boolean {
    const msg = ensureError(error).message.toLowerCase();
    return RETRYABLE_ERROR_MARKERS.some((marker) => msg.includes(marker));
  }

  // Bulletin writes go through the host preimage manager: the host builds,
  // signs, and submits the TransactionStorage extrinsic with its own authorized
  // account (provisioned from BulletinAllowance on first use). The papp never
  // signs — the product account holds no storage authorization. The host drives
  // the PreimageSubmit + store-data prompts itself on first submit per session.
  async function storeContent(contentBytes: Uint8Array): Promise<void> {
    const manager = await getPreimageManager();
    if (!manager) {
      throw new Error("Host storage unavailable — open dotNS inside a Polkadot host.");
    }
    await manager.submit(contentBytes);
  }

  async function storeWithRetries(contentBytes: Uint8Array): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await storeContent(contentBytes);
        return;
      } catch (err) {
        if (!isRetryableError(err) || attempt === MAX_RETRIES) throw err;

        const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 800;
        await sleep(delay + Math.floor(Math.random() * 100));
      }
    }
  }

  async function withUploadWorker<T>(
    run: (uploadWorker: BulletinUploadWorkerClient) => Promise<T>,
  ): Promise<T> {
    const uploadWorker = new BulletinUploadWorkerClient();

    try {
      return await run(uploadWorker);
    } finally {
      uploadWorker.destroy();
    }
  }

  async function storePreparedBytes(
    prepareStage: UploadStage,
    storeStage: UploadStage,
    prepareMessage: string,
    storeMessage: string,
    progress: number,
    prepare: () => Promise<PreparedChunk>,
  ): Promise<StorePreparedResult> {
    setStage(prepareStage, prepareMessage, progress);
    const prepared = await prepare();
    const cidString = prepared.cid;
    const byteLength = prepared.length;
    let bytes: Uint8Array | null = prepared.bytes;

    await yieldToBrowser();

    if (!bytes) {
      throw new Error("Prepared upload bytes are not available.");
    }

    setStage(storeStage, storeMessage, progress);
    await storeWithRetries(bytes);
    bytes = null;

    await yieldToBrowser();

    return { cid: cidString, length: byteLength };
  }

  async function withUploadLifecycle<T>(
    timeoutMessage: string,
    cacheToStore: boolean,
    fn: () => Promise<T>,
  ): Promise<T> {
    resetUploadState();
    isUploading.value = true;
    cachingEnabled.value = cacheToStore;
    window.onbeforeunload = () => "Upload in progress. Are you sure you want to leave?";

    const globalTimeout = setTimeout(() => {
      if (isUploading.value) {
        uploadError.value = timeoutMessage;
        uploadStage.value = "error";
        isUploading.value = false;
        window.onbeforeunload = null;
      }
    }, UPLOAD_GLOBAL_TIMEOUT_MS);

    try {
      return await fn();
    } catch (error) {
      const err = ensureError(error);
      const friendlyMessage = formatTransactionError(err);
      setStage("error", friendlyMessage, 0);
      uploadError.value = friendlyMessage;
      throw err;
    } finally {
      clearTimeout(globalTimeout);
      cleanup();
    }
  }

  async function uploadFile(
    file: File,
    options: { cacheToStore?: boolean } = {},
  ): Promise<BulletinUploadResult> {
    return withUploadLifecycle(
      "Upload timed out after 5 minutes. Completed chunks are saved — try again to resume.",
      Boolean(options.cacheToStore),
      async () => {
        if (!isBrowserUploadSizeAllowed(file.size)) {
          throw new Error(
            `Browser uploads are limited to ${formatBytes(MAX_BROWSER_UPLOAD_SIZE)}. Use the CLI for larger files or directories.`,
          );
        }

        setStage("preparing", "Preparing upload...", 2);

        const result = await withUploadWorker((uploadWorker) =>
          getUploadApprovalPlan(file.size).needsChunking
            ? uploadChunkedFile(file, uploadWorker)
            : uploadSingleBlock(file, uploadWorker),
        );

        await verifyAndCacheUpload(result.cid, options);

        setStage("done", "Upload complete!", 100);
        return result;
      },
    );
  }

  async function uploadSingleBlock(
    file: File,
    uploadWorker: BulletinUploadWorkerClient,
  ): Promise<BulletinUploadResult> {
    chunksTotal.value = 1;
    chunksCompleted.value = 0;
    const prepared = await storePreparedBytes(
      "preparing",
      "signing",
      `Preparing ${formatBytes(file.size)} for upload...`,
      "Storing on the Bulletin chain via the host...",
      90,
      () => uploadWorker.prepareSlice(file, 0, file.size, CODEC_RAW),
    );
    chunksCompleted.value = 1;
    uploadedCid.value = prepared.cid;
    return { cid: prepared.cid };
  }

  async function uploadChunkedFile(
    file: File,
    uploadWorker: BulletinUploadWorkerClient,
  ): Promise<BulletinUploadResult> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    chunksTotal.value = totalChunks;

    const fileKey = getFileKey(file);
    const resumeState = loadResumeState(fileKey);
    const completedChunks: CompletedChunk[] = [];
    const completedIndexes = new Set<number>();

    if (resumeState && resumeState.totalChunks === totalChunks) {
      completedChunks.push(...resumeState.completedChunks);
      for (const chunk of resumeState.completedChunks) {
        completedIndexes.add(chunk.index);
      }
      chunksCompleted.value = completedChunks.length;
      const skipped = completedChunks.length;
      setStage(
        "chunking",
        `Resuming: ${skipped}/${totalChunks} chunks already uploaded`,
        5 + (skipped / totalChunks) * 80,
      );
    } else {
      chunksCompleted.value = 0;
      setStage("chunking", `Uploading ${formatBytes(file.size)} in ${totalChunks} chunks...`, 5);
    }

    for (let i = 0; i < totalChunks; i++) {
      if (completedIndexes.has(i)) continue;

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkProgress = 5 + ((chunksCompleted.value + 1) / totalChunks) * 80;
      const preparedChunk = await storePreparedBytes(
        "chunking",
        "chunking",
        `Preparing chunk ${chunksCompleted.value + 1}/${totalChunks} in the background`,
        `Storing chunk ${chunksCompleted.value + 1}/${totalChunks} via the host...`,
        chunkProgress,
        () => uploadWorker.prepareSlice(file, start, end, CODEC_RAW),
      );

      completedChunks.push({ index: i, cid: preparedChunk.cid, length: preparedChunk.length });
      chunksCompleted.value = completedChunks.length;

      if (completedChunks.length % 5 === 0 || completedChunks.length === totalChunks) {
        saveResumeState({ fileKey, totalChunks, completedChunks });
      }
    }

    completedChunks.sort((a, b) => a.index - b.index);

    const preparedRoot = await storePreparedBytes(
      "building-root",
      "building-root",
      "Building DAG-PB root in the background...",
      "Storing the root node via the host...",
      95,
      () => uploadWorker.prepareRoot(completedChunks),
    );

    clearResumeState();
    uploadedCid.value = preparedRoot.cid;
    return { cid: preparedRoot.cid };
  }

  function cleanup(): void {
    isUploading.value = false;
    window.onbeforeunload = null;
  }

  return {
    isUploading,
    uploadProgress,
    uploadStage,
    uploadError,
    statusMessage,
    uploadedCid,
    uploadVerification,
    chunksCompleted,
    chunksTotal,
    storeTransactionHash,
    cachingEnabled,
    maxTxSizeBytes: MAX_TX_SIZE,
    chunkSizeBytes: CHUNK_SIZE,
    browserUploadLimitBytes: MAX_BROWSER_UPLOAD_SIZE,
    getUploadApprovalPlan,
    isBrowserUploadSizeAllowed,
    getPendingUploadInfo,
    clearResumeState,
    resetUploadState,
    uploadFile,
    formatBytes,
  };
});
