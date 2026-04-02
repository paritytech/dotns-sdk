import { defineStore } from "pinia";
import { ref } from "vue";
import { createClient, type PolkadotClient, type PolkadotSigner } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { Binary } from "polkadot-api";
import { bulletin } from "@polkadot-api/descriptors";
import { useWalletStore } from "./useWalletStore";
import { useUserStoreManager } from "./useUserStoreManager";
import type { BulletinUploadResult } from "@/type";
import { verifyCidWithGateways, type CidVerificationResult } from "@/lib/ipfs";
import {
  BULLETIN_RPC,
  CHUNK_SIZE,
  CODEC_DAG_PB,
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

const STORE_TIMEOUT_MS = 120_000;
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

function formatDispatchError(dispatchError: { type: string; value?: unknown }): string {
  if (dispatchError.type === "Module") {
    const moduleError = dispatchError.value as {
      type: string;
      value?: { type: string };
    };
    return `Module error: ${moduleError.type}.${moduleError.value?.type || "Unknown"}`;
  }
  return dispatchError.type;
}

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

let sharedBulletinClient: PolkadotClient | null = null;

function getBulletinClient(): PolkadotClient {
  if (!sharedBulletinClient) {
    sharedBulletinClient = createClient(withPolkadotSdkCompat(getWsProvider(BULLETIN_RPC)));
  }
  return sharedBulletinClient;
}

function destroyBulletinClient(): void {
  if (sharedBulletinClient) {
    try {
      sharedBulletinClient.destroy();
    } catch (error) {
      console.warn("[BulletinStore] Client destroy failed:", error);
    }
    sharedBulletinClient = null;
  }
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

  function storeContent(
    typedApi: ReturnType<PolkadotClient["getTypedApi"]>,
    signer: PolkadotSigner,
    contentBytes: Uint8Array,
    codec: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let subscription: { unsubscribe: () => void } | undefined;
      let transactionReference: any = null;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          subscription?.unsubscribe();
        } catch (error) {
          console.warn("[BulletinStore] Subscription cleanup failed:", error);
        }
        subscription = undefined;
        transactionReference = null;
        reject(new Error("store-timeout"));
      }, STORE_TIMEOUT_MS);

      function finish(error?: Error): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          subscription?.unsubscribe();
        } catch (error) {
          console.warn("[BulletinStore] Subscription cleanup failed:", error);
        }
        subscription = undefined;
        transactionReference = null;
        useWalletStore().setTransactionStatus("idle");
        if (error) reject(error);
        else resolve();
      }

      transactionReference = (typedApi as any).tx.TransactionStorage.store_with_cid_config({
        cid: {
          codec: BigInt(codec),
          hashing: { type: "Sha2_256", value: undefined },
        },
        data: Binary.fromBytes(contentBytes),
      });

      const walletStore = useWalletStore();

      try {
        subscription = transactionReference.signSubmitAndWatch(signer).subscribe({
          next: (event: any) => {
            if (settled) return;
            switch (event.type) {
              case "signed":
                walletStore.setTransactionStatus("signing");
                break;
              case "broadcasted":
                walletStore.setTransactionStatus("broadcasting");
                break;
              case "txBestBlocksState":
                if (event.found) {
                  walletStore.setTransactionStatus("included");
                  if (event.ok) {
                    walletStore.setTransactionStatus("finalized");
                    finish();
                  } else {
                    const msg = event.dispatchError
                      ? formatDispatchError(event.dispatchError)
                      : "Transaction failed";
                    finish(new Error(msg));
                  }
                }
                break;
            }
          },
          error: (err: unknown) => finish(ensureError(err)),
        });
      } catch (err) {
        finish(ensureError(err));
      }
    });
  }

  async function storeWithRetries(
    typedApi: ReturnType<PolkadotClient["getTypedApi"]>,
    signer: PolkadotSigner,
    contentBytes: Uint8Array,
    codec: number,
  ): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await storeContent(typedApi, signer, contentBytes, codec);
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
    typedApi: ReturnType<PolkadotClient["getTypedApi"]>,
    signer: PolkadotSigner,
    prepareStage: UploadStage,
    signStage: UploadStage,
    prepareMessage: string,
    signMessage: string,
    progress: number,
    codec: number,
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

    setStage(signStage, signMessage, progress);
    await storeWithRetries(typedApi, signer, bytes, codec);
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
        const walletStore = useWalletStore();

        if (!isBrowserUploadSizeAllowed(file.size)) {
          throw new Error(
            `Browser uploads are limited to ${formatBytes(MAX_BROWSER_UPLOAD_SIZE)}. Use the CLI for larger files or directories.`,
          );
        }

        walletStore.ensureConnected();
        const signer = walletStore.getInjected();

        setStage("preparing", "Connecting to Bulletin chain...", 2);
        const bulletinClient = getBulletinClient();
        const typedApi = bulletinClient.getTypedApi(bulletin);

        const result = await withUploadWorker((uploadWorker) =>
          uploadChunkedFile(file, typedApi, signer, uploadWorker),
        );

        await verifyAndCacheUpload(result.cid, options);

        setStage("done", "Upload complete!", 100);
        return result;
      },
    );
  }

  async function uploadChunkedFile(
    file: File,
    typedApi: ReturnType<PolkadotClient["getTypedApi"]>,
    signer: PolkadotSigner,
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
        typedApi,
        signer,
        "chunking",
        "chunking",
        `Preparing chunk ${chunksCompleted.value + 1}/${totalChunks} in the background`,
        `Approve chunk ${chunksCompleted.value + 1}/${totalChunks} in your wallet`,
        chunkProgress,
        CODEC_RAW,
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
      typedApi,
      signer,
      "building-root",
      "building-root",
      "Building DAG-PB root in the background...",
      "Approve root node in your wallet",
      95,
      CODEC_DAG_PB,
      () => uploadWorker.prepareRoot(completedChunks),
    );

    clearResumeState();
    uploadedCid.value = preparedRoot.cid;
    return { cid: preparedRoot.cid };
  }

  function cleanup(): void {
    destroyBulletinClient();
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
