<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { zeroHash } from "viem";
import { useToast } from "vue-toastification";
import { useBulletinStore } from "@/store/useBulletinStore";
import { useWalletStore } from "@/store/useWalletStore";
import Button from "@/components/ui/Button.vue";
import TransactionStatus from "@/components/TransactionStatus.vue";
import AuthorizeStoreModal from "@/components/modals/AuthorizeStoreModal.vue";
import UploadApprovalStepper from "./UploadApprovalStepper.vue";
import { useStoreAuthGuard } from "@/composables/useStoreAuthGuard";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { encodeForPreview } from "@/lib/preview";
import type { TransactionResult } from "@/type";
import type { ApprovalStep, PendingUploadInfo } from "@/lib/bulletinUploadWorkerProtocol";

const emit = defineEmits<{
  "upload-complete": [cid: string];
  error: [message: string];
}>();

const RELEASES_URL = "https://github.com/paritytech/dotns-sdk/releases";

const router = useRouter();
const toast = useToast();
const bulletinStore = useBulletinStore();
const walletStore = useWalletStore();
const authGuard = useStoreAuthGuard();
const userStoreManager = useUserStoreManager();
const cacheToStore = ref(false);
const hasStore = ref(false);

watch(
  () => walletStore.isConnected,
  async (connected) => {
    if (connected && walletStore.evmAddress) {
      const store = await userStoreManager.getUserStore(walletStore.evmAddress as `0x${string}`);
      hasStore.value = store !== "0x0000000000000000000000000000000000000000";
      cacheToStore.value = hasStore.value;
    } else {
      hasStore.value = false;
      cacheToStore.value = false;
    }
  },
  { immediate: true },
);

const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const copiedAuthorize = ref(false);
const acceptedApprovalPrompt = ref(false);

const showTransaction = ref(false);
const expectedResumeFileName = ref<string | null>(null);
const transaction = ref<TransactionResult>({ hash: zeroHash, status: undefined });
const pendingUpload = ref<PendingUploadInfo | null>(bulletinStore.getPendingUploadInfo());

onMounted(() => {
  bulletinStore.resetUploadState();
  pendingUpload.value = bulletinStore.getPendingUploadInfo();
});

onBeforeUnmount(() => {
  window.onbeforeunload = null;
  if (!bulletinStore.isUploading) {
    bulletinStore.resetUploadState();
  }
});

function resumePendingUpload(): void {
  expectedResumeFileName.value = pendingUpload.value?.fileName ?? null;
  pendingUpload.value = null;
  nextTick(() => {
    fileInputRef.value?.click();
  });
}

function discardPendingUpload(): void {
  bulletinStore.clearResumeState();
  pendingUpload.value = null;
}

watch(
  () => bulletinStore.uploadStage,
  (stage) => {
    if (stage === "caching") {
      transaction.value = { hash: zeroHash, status: undefined };
      showTransaction.value = true;
    }
    if (stage === "done") {
      transaction.value = {
        hash: (bulletinStore.storeTransactionHash as `0x${string}`) || zeroHash,
        status: true,
      };
      showTransaction.value = true;
    }
    if (stage === "error" && showTransaction.value) {
      transaction.value = { hash: zeroHash, status: false };
    }
  },
);

watch(selectedFile, () => {
  acceptedApprovalPrompt.value = false;
});

const authorizeCommand = computed(() => {
  const addr = walletStore.substrateAddress || "<your-address>";
  return `dotns bulletin authorize ${addr}`;
});

async function copyAuthorizeCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(authorizeCommand.value);
    copiedAuthorize.value = true;
    setTimeout(() => {
      copiedAuthorize.value = false;
    }, 2000);
  } catch (error) {
    console.warn("[FileUpload] Clipboard write failed:", error);
  }
}

const isWalletConnected = computed(() => walletStore.isConnected);
const browserUploadLimitLabel = computed(() =>
  bulletinStore.formatBytes(bulletinStore.browserUploadLimitBytes),
);
const uploadPlan = computed(() => {
  if (!selectedFile.value) {
    return null;
  }

  return bulletinStore.getUploadApprovalPlan(selectedFile.value.size);
});
const exceedsBrowserLimit = computed(
  () => !!selectedFile.value && !bulletinStore.isBrowserUploadSizeAllowed(selectedFile.value.size),
);
const canUpload = computed(
  () =>
    isWalletConnected.value &&
    !!selectedFile.value &&
    !bulletinStore.isUploading &&
    !exceedsBrowserLimit.value &&
    (!requiresApprovalConsent.value || acceptedApprovalPrompt.value),
);
const isChunked = computed(() => uploadPlan.value?.needsChunking ?? false);
const requiresApprovalConsent = computed(() => (uploadPlan.value?.totalApprovalCount ?? 0) > 2);
const approvalBreakdown = computed(() => {
  if (!uploadPlan.value) {
    return "";
  }

  if (!uploadPlan.value.needsChunking) {
    return "1 upload approval and 1 Store write approval.";
  }

  return `${uploadPlan.value.chunkCount} chunk approvals, 1 root approval, and 1 Store write approval.`;
});
const approvalSteps = computed(() => {
  if (!uploadPlan.value) {
    return [];
  }

  const steps: ApprovalStep[] = [];

  if (uploadPlan.value.needsChunking) {
    for (let index = 0; index < uploadPlan.value.chunkCount; index += 1) {
      steps.push({
        key: `chunk-${index}`,
        label: `Approve chunk ${index + 1}`,
        shortLabel: `${index + 1}`,
      });
    }

    steps.push({
      key: "root",
      label: "Approve root node",
      shortLabel: "Root",
    });
  } else {
    steps.push({
      key: "upload",
      label: "Approve file upload",
      shortLabel: "Upload",
    });
  }

  steps.push({
    key: "store",
    label: "Approve Store write",
    shortLabel: "Store",
  });

  return steps;
});
const completedApprovalCount = computed(() => {
  const plan = uploadPlan.value;
  if (!plan) {
    return 0;
  }

  if (bulletinStore.uploadStage === "done") {
    return approvalSteps.value.length;
  }

  if (!plan.needsChunking) {
    if (bulletinStore.uploadStage === "verifying" || bulletinStore.uploadStage === "caching") {
      return 1;
    }
    return 0;
  }

  if (bulletinStore.uploadStage === "verifying" || bulletinStore.uploadStage === "caching") {
    return plan.chunkCount + 1;
  }

  return Math.min(bulletinStore.chunksCompleted, plan.chunkCount);
});
const activeApprovalIndex = computed(() => {
  const plan = uploadPlan.value;
  if (!plan || approvalSteps.value.length === 0) {
    return -1;
  }

  if (bulletinStore.uploadStage === "done") {
    return -1;
  }

  if (bulletinStore.uploadStage === "caching" || bulletinStore.uploadStage === "verifying") {
    return approvalSteps.value.length - 1;
  }

  if (!plan.needsChunking) {
    return 0;
  }

  if (bulletinStore.uploadStage === "building-root") {
    return plan.chunkCount;
  }

  return Math.min(bulletinStore.chunksCompleted, Math.max(0, plan.chunkCount - 1));
});
const approvalStepStates = computed(() => {
  return approvalSteps.value.map((step, index) => {
    let status: "done" | "active" | "pending" = "pending";

    if (index < completedApprovalCount.value) {
      status = "done";
    } else if (index === activeApprovalIndex.value) {
      status = "active";
    }

    return {
      ...step,
      status,
    };
  });
});

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(): void {
  isDragging.value = false;
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  isDragging.value = false;

  if (bulletinStore.isUploading) return;

  const files = event.dataTransfer?.files;
  if (!files?.length) return;

  selectFile(files[0]!);
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  selectFile(input.files[0]!);
  input.value = "";
}

function selectFile(file: File): void {
  bulletinStore.resetUploadState();
  acceptedApprovalPrompt.value = false;

  if (file.size === 0) {
    bulletinStore.uploadError = "Cannot upload an empty file.";
    emit("error", bulletinStore.uploadError);
    selectedFile.value = null;
    return;
  }

  if (expectedResumeFileName.value && file.name !== expectedResumeFileName.value) {
    bulletinStore.clearResumeState();
    const toast = useToast();
    toast.warning(
      `Selected "${file.name}" instead of "${expectedResumeFileName.value}". Resume state cleared — starting fresh.`,
    );
  }
  expectedResumeFileName.value = null;

  selectedFile.value = file;
}

function removeFile(): void {
  selectedFile.value = null;
  acceptedApprovalPrompt.value = false;
  bulletinStore.resetUploadState();
}

function openFileDialog(): void {
  fileInputRef.value?.click();
}

async function executeUpload(): Promise<void> {
  if (!selectedFile.value) return;

  try {
    const result = await bulletinStore.uploadFile(selectedFile.value, {
      cacheToStore: cacheToStore.value,
    });
    emit("upload-complete", result.cid);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    toast.error("Upload failed");
    emit("error", message);
  }
}

async function startUpload(): Promise<void> {
  if (!isWalletConnected.value) return;

  if (!selectedFile.value) return;

  if (exceedsBrowserLimit.value) {
    const message = `Browser uploads are limited to ${browserUploadLimitLabel.value}. Use the CLI for larger files or directories.`;
    toast.error(message);
    emit("error", message);
    return;
  }

  if (requiresApprovalConsent.value && !acceptedApprovalPrompt.value) {
    const message = "Please confirm that this upload will require repeated wallet approvals.";
    toast.error(message);
    emit("error", message);
    return;
  }

  await authGuard.checkAuthAndProceed(executeUpload);
}

function handleTransactionClose(): void {
  showTransaction.value = false;
  if (!bulletinStore.uploadedCid) return;

  const verified = bulletinStore.uploadVerification?.resolvable ?? false;

  if (verified) {
    const encoded = encodeForPreview(bulletinStore.uploadedCid);
    toast.success("Upload complete! Redirecting to preview...");
    bulletinStore.resetUploadState();
    router.push({ path: `/preview/${encoded}` });
  } else {
    toast.warning(
      "Content uploaded but not yet resolvable on IPFS gateways. It may still be propagating.",
    );
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!isWalletConnected"
      class="border border-dot-border border-dashed rounded-lg p-4 text-center"
    >
      <svg
        class="w-8 h-8 mx-auto mb-3 text-dot-text-tertiary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <p class="text-dot-text-tertiary text-sm">Connect your wallet to upload from the browser.</p>
    </div>

    <div
      v-else-if="pendingUpload"
      class="rounded-lg border border-dot-accent/30 bg-dot-accent-soft p-3"
    >
      <div class="flex items-start gap-3">
        <span class="mt-0.5 shrink-0 text-dot-accent">
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
        <div class="flex-1 text-sm leading-relaxed min-w-0">
          <p
            class="font-semibold text-dot-text-primary mb-1 truncate"
            :title="pendingUpload.fileName"
          >
            Resume upload
          </p>
          <p class="text-dot-text-secondary">
            <span class="font-medium text-dot-text-primary break-all">{{
              pendingUpload.fileName.length > 40
                ? pendingUpload.fileName.slice(0, 40) + "..."
                : pendingUpload.fileName
            }}</span>
            — {{ pendingUpload.completedChunks }} of {{ pendingUpload.totalChunks }} chunks already
            on chain. Re-select the same file to resume. Completed chunks are skipped automatically.
          </p>
          <div class="flex flex-col sm:flex-row gap-2 mt-3">
            <Button size="sm" @click="resumePendingUpload"> Select file to resume </Button>
            <Button size="sm" variant="secondary" @click="discardPendingUpload">
              Discard &amp; start fresh
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!selectedFile && bulletinStore.uploadStage === 'idle'"
      class="group border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-dot-bg"
      :class="[
        isDragging
          ? 'border-dot-accent bg-dot-accent/5'
          : 'border-dot-border hover:border-dot-border-strong',
      ]"
      tabindex="0"
      role="button"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="openFileDialog"
      @keydown.enter="openFileDialog"
      @keydown.space.prevent="openFileDialog"
    >
      <input ref="fileInputRef" type="file" class="hidden" @change="handleFileInput" />
      <svg
        class="w-8 h-8 mx-auto mb-3 text-dot-text-tertiary transition-colors duration-200 group-hover:text-dot-text-secondary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p class="text-dot-text-secondary text-sm mb-1">Drop a file or click to select</p>
      <p class="text-dot-text-tertiary text-xs">
        Files over 8 MB are automatically chunked and reassembled
      </p>
    </div>

    <div v-else-if="selectedFile" class="space-y-3">
      <div class="bg-dot-bg border border-dot-border rounded-lg p-3 flex items-center gap-3">
        <svg
          class="w-5 h-5 text-dot-text-tertiary shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <div class="flex-1 min-w-0">
          <p class="text-dot-text-primary text-sm truncate">{{ selectedFile.name }}</p>
          <p class="text-dot-text-tertiary text-xs tabular-nums">
            {{ bulletinStore.formatBytes(selectedFile.size) }}
            <span v-if="uploadPlan">
              &middot; {{ uploadPlan?.totalApprovalCount ?? 0 }} approvals
            </span>
            <span v-if="isChunked"> &middot; {{ uploadPlan?.chunkCount ?? 0 }} chunks </span>
          </p>
        </div>
        <button
          v-if="!bulletinStore.isUploading"
          @click="removeFile"
          class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-dot-text-tertiary hover:text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div v-if="uploadPlan" class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-dot-text-tertiary">
            Browser limit
          </p>
          <p class="mt-1 text-sm font-medium text-dot-text-primary tabular-nums">
            {{ browserUploadLimitLabel }}
          </p>
        </div>

        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-dot-text-tertiary">
            Wallet approvals
          </p>
          <p class="mt-1 text-sm font-medium text-dot-text-primary tabular-nums">
            {{ uploadPlan?.totalApprovalCount ?? 0 }}
          </p>
        </div>

        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-dot-text-tertiary">
            Upload mode
          </p>
          <p class="mt-1 text-sm font-medium text-dot-text-primary">
            {{ isChunked ? "Chunked file upload" : "Single file upload" }}
          </p>
        </div>
      </div>

      <div
        v-if="exceedsBrowserLimit"
        class="rounded-lg border border-error/30 bg-error/10 p-3 space-y-2"
      >
        <p class="text-sm font-medium text-error">Browser upload limit reached</p>
        <p class="text-xs text-dot-text-secondary">
          This file is {{ bulletinStore.formatBytes(selectedFile.size) }}. Browser uploads are
          limited to {{ browserUploadLimitLabel }} to keep approvals and memory usage manageable.
          Use the CLI for anything larger.
        </p>
        <a
          :href="RELEASES_URL"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-11 items-center justify-center rounded-lg border border-dot-border px-4 text-xs font-medium text-dot-text-primary transition-colors duration-200 ease-out hover:bg-dot-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40"
        >
          Install the CLI
        </a>
      </div>

      <div
        v-else-if="requiresApprovalConsent"
        class="rounded-lg border border-dot-border bg-dot-surface p-3 space-y-3"
      >
        <div class="space-y-1">
          <p class="text-sm font-medium text-dot-text-primary">
            Large uploads require repeated wallet approvals
          </p>
          <p class="text-xs text-dot-text-secondary">
            This upload is expected to trigger {{ uploadPlan?.totalApprovalCount ?? 0 }} wallet
            prompts.
            {{ approvalBreakdown }}
          </p>
        </div>

        <button
          type="button"
          class="flex items-center gap-3 rounded-lg border min-h-11 px-3 py-2 text-sm text-left w-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40"
          :class="
            acceptedApprovalPrompt
              ? 'border-dot-accent/40 bg-dot-accent/5 text-dot-text-primary cursor-default'
              : 'border-dot-border bg-dot-bg text-dot-text-secondary hover:border-dot-border-strong cursor-pointer'
          "
          :disabled="acceptedApprovalPrompt"
          @click="!acceptedApprovalPrompt && (acceptedApprovalPrompt = true)"
        >
          <span
            class="h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors duration-200"
            :class="
              acceptedApprovalPrompt
                ? 'bg-dot-text-primary border-dot-text-primary'
                : 'border-dot-border bg-dot-surface'
            "
          >
            <svg
              v-if="acceptedApprovalPrompt"
              class="h-2.5 w-2.5 text-dot-bg"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span>
            I understand that my wallet will prompt me repeatedly before this upload completes.
          </span>
        </button>
      </div>

      <UploadApprovalStepper
        v-if="approvalStepStates.length > 0"
        :steps="approvalStepStates"
        :active-index="activeApprovalIndex"
        :completed-count="completedApprovalCount"
      />

      <div v-if="bulletinStore.isUploading" class="space-y-2">
        <div class="h-1.5 bg-dot-surface-secondary rounded-full overflow-hidden">
          <div
            class="h-full bg-dot-accent rounded-full transition-all duration-500 ease-out"
            :style="{ width: `${bulletinStore.uploadProgress}%` }"
          />
        </div>
        <div class="flex items-center justify-between gap-2">
          <p class="text-dot-text-secondary text-xs truncate">
            {{ bulletinStore.statusMessage }}
          </p>
          <div class="flex items-center gap-2 shrink-0">
            <span
              v-if="bulletinStore.chunksTotal > 1"
              class="text-dot-text-tertiary text-xs tabular-nums"
            >
              {{ bulletinStore.chunksCompleted }}/{{ bulletinStore.chunksTotal }}
            </span>
            <span class="text-dot-text-tertiary text-xs tabular-nums">
              {{ bulletinStore.uploadProgress }}%
            </span>
          </div>
        </div>
      </div>

      <div
        v-if="selectedFile && !bulletinStore.isUploading && isWalletConnected"
        class="rounded-lg border border-dot-border bg-dot-surface px-3 py-2"
      >
        <button
          type="button"
          class="flex items-center gap-3 text-sm text-left w-full min-h-11 transition-colors duration-200 ease-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40 rounded-lg"
          @click="cacheToStore = !cacheToStore"
        >
          <span
            class="h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors duration-200"
            :class="
              cacheToStore
                ? 'bg-dot-text-primary border-dot-text-primary'
                : 'border-dot-border bg-dot-surface'
            "
          >
            <svg
              v-if="cacheToStore"
              class="h-2.5 w-2.5 text-dot-bg"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="3"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span class="text-dot-text-secondary">
            Save CID to on-chain Store
            <span v-if="!hasStore" class="text-dot-text-tertiary">(will deploy a Store)</span>
          </span>
        </button>
      </div>

      <div class="flex justify-end">
        <Button
          v-if="!bulletinStore.isUploading && bulletinStore.uploadStage !== 'done'"
          @click="startUpload"
          :disabled="!canUpload"
          variant="primary"
          size="sm"
        >
          {{ exceedsBrowserLimit ? "Use CLI for This Upload" : "Upload to Bulletin Chain" }}
        </Button>
      </div>
    </div>

    <div
      v-if="bulletinStore.uploadError"
      class="bg-error/10 border border-error/20 rounded-lg p-3 space-y-2"
    >
      <p class="text-error text-sm">{{ bulletinStore.uploadError }}</p>
      <div
        v-if="
          bulletinStore.uploadError.includes('authorized') ||
          bulletinStore.uploadError.includes('Authorization') ||
          bulletinStore.uploadError.includes('authorize')
        "
        class="text-dot-text-tertiary text-xs space-y-1"
      >
        <p>
          Your account needs authorization on the Bulletin chain.
          <a
            :href="RELEASES_URL"
            target="_blank"
            rel="noopener"
            class="text-dot-accent hover:text-dot-accent-hover hover:underline transition-colors duration-200"
            >Install the CLI</a
          >
          then run:
        </p>
        <div class="flex items-center gap-2 bg-dot-bg rounded-lg px-3 py-2 mt-1">
          <code class="font-mono text-dot-text-secondary text-xs flex-1 break-all">
            {{ authorizeCommand }}
          </code>
          <button
            @click="copyAuthorizeCommand"
            class="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-dot-text-tertiary hover:text-dot-text-secondary transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/40"
            title="Copy command"
          >
            <svg
              v-if="copiedAuthorize"
              class="w-4 h-4 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
        </div>
        <router-link
          to="/docs/dweb/bulletin"
          class="text-dot-accent hover:text-dot-accent-hover hover:underline transition-colors duration-200 inline-block mt-1"
        >
          Learn more about authorization
        </router-link>
      </div>
      <button
        @click="
          () => {
            removeFile();
            bulletinStore.resetUploadState();
          }
        "
        class="text-dot-text-secondary text-xs hover:text-dot-text-primary transition-colors duration-200 ease-out min-h-11 inline-flex items-center"
      >
        Try again
      </button>
    </div>

    <TransactionStatus
      :open="showTransaction"
      handle="Saving CID to Store"
      :transaction="transaction"
      @close="handleTransactionClose"
    />

    <AuthorizeStoreModal
      :open="authGuard.showAuthModal.value"
      :contracts="authGuard.authStatuses.value"
      :loading="authGuard.authLoading.value"
      :progress="authGuard.authProgress.value"
      :error="authGuard.authError.value"
      @submit="authGuard.handleAuthSubmit"
      @close="authGuard.handleAuthClose"
    />
  </div>
</template>
