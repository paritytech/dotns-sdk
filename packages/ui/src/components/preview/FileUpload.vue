<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { zeroHash } from "viem";
import { useToast } from "vue-toastification";
import { useBulletinStore } from "@/store/useBulletinStore";
import { useWalletStore } from "@/store/useWalletStore";
import Button from "@/components/ui/Button.vue";
import TransactionStatus from "@/components/TransactionStatus.vue";
import UploadApprovalStepper from "./UploadApprovalStepper.vue";
import { encodeForPreview } from "@/lib/preview";
import type { TransactionResult } from "@/type";

const props = defineProps<{
  mode: "file" | "folder";
}>();

const emit = defineEmits<{
  "upload-complete": [cid: string];
  error: [message: string];
}>();

const RELEASES_URL = "https://github.com/paritytech/dotns-sdk/releases";

const router = useRouter();
const toast = useToast();
const bulletinStore = useBulletinStore();
const walletStore = useWalletStore();

const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const copiedAuthorize = ref(false);
const acceptedApprovalPrompt = ref(false);

const showTransaction = ref(false);
const expectedResumeFileName = ref<string | null>(null);
const transaction = ref<TransactionResult>({ hash: zeroHash, status: undefined });
const pendingUpload = ref(bulletinStore.getPendingUploadInfo());

onMounted(() => {
  bulletinStore.resetUploadState();
  pendingUpload.value = bulletinStore.getPendingUploadInfo();
});

onBeforeUnmount(() => {
  window.onbeforeunload = null;
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
    if (stage === "done" && showTransaction.value) {
      transaction.value = {
        hash: (bulletinStore.storeTransactionHash as `0x${string}`) || zeroHash,
        status: true,
      };
    }
    if (stage === "error" && showTransaction.value) {
      transaction.value = { hash: zeroHash, status: false };
    }
  },
);

watch(
  () => props.mode,
  () => {
    acceptedApprovalPrompt.value = false;
    selectedFile.value = null;
    showTransaction.value = false;
    transaction.value = { hash: zeroHash, status: undefined };
    bulletinStore.resetUploadState();
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
  } catch {
    /* noop */
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
    props.mode === "file" &&
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

  const steps: { key: string; label: string; shortLabel: string }[] = [];

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
const verificationMessage = computed(() => {
  const verification = bulletinStore.uploadVerification;
  if (!verification) {
    return null;
  }

  if (verification.resolvable) {
    try {
      return `Verified via ${new URL(verification.gateway).host}`;
    } catch {
      return `Verified via ${verification.gateway}`;
    }
  }

  return "Stored on Bulletin. IPFS gateway verification may still be propagating.";
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

  if (bulletinStore.isUploading || props.mode !== "file") return;

  const files = event.dataTransfer?.files;
  if (!files?.length) return;

  if (props.mode === "file") {
    selectFile(files[0]!);
  }
}

function handleFileInput(event: Event): void {
  if (props.mode !== "file") return;

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
  if (props.mode !== "file") return;
  fileInputRef.value?.click();
}

async function startUpload(): Promise<void> {
  if (!selectedFile.value || !isWalletConnected.value || props.mode !== "file") return;

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

  try {
    const result = await bulletinStore.uploadFile(selectedFile.value);
    emit("upload-complete", result.cid);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    toast.error("Upload failed");
    emit("error", message);
  }
}

function handleTransactionClose(): void {
  showTransaction.value = false;
  if (bulletinStore.uploadedCid) {
    const encoded = encodeForPreview(bulletinStore.uploadedCid);
    toast.success("Upload complete! Redirecting to preview...");
    router.push({ path: `/preview/${encoded}` });
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!isWalletConnected"
      class="border border-dot-border border-dashed rounded-lg p-4 sm:p-6 text-center"
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
      v-else-if="mode === 'folder' && !selectedFile && bulletinStore.uploadStage === 'idle'"
      class="border border-dot-border rounded-lg p-4 sm:p-6 space-y-4"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dot-border bg-dot-surface-secondary"
        >
          <svg
            class="h-5 w-5 text-dot-text-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-dot-text-primary">
            Browser folder uploads are not available yet
          </p>
          <p class="mt-1 text-sm text-dot-text-secondary">
            Use the CLI for website folders and directories. The browser flow is capped at
            {{ browserUploadLimitLabel }} for single files and does not build a real UnixFS
            directory layout yet.
          </p>
        </div>
      </div>

      <div class="rounded-lg border border-dot-border bg-dot-bg p-3">
        <p class="text-xs font-medium text-dot-text-primary">Recommended command</p>
        <code class="mt-2 block break-all font-mono text-xs text-dot-text-secondary">
          dotns bulletin upload ./dist
        </code>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row">
        <a
          :href="RELEASES_URL"
          target="_blank"
          rel="noopener"
          class="inline-flex h-10 items-center justify-center rounded-lg border border-dot-border px-4 text-sm font-medium text-dot-text-primary transition-colors hover:bg-dot-surface-secondary"
        >
          Install the CLI
        </a>
        <router-link
          to="/docs/tools/cli"
          class="inline-flex h-10 items-center justify-center rounded-lg border border-dot-border px-4 text-sm font-medium text-dot-text-secondary transition-colors hover:bg-dot-surface-secondary hover:text-dot-text-primary"
        >
          Read CLI docs
        </router-link>
      </div>
    </div>

    <div
      v-else-if="pendingUpload"
      class="rounded-xl border border-dot-accent/30 bg-dot-accent-soft p-4"
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
          <p class="font-semibold text-dot-accent mb-1">
            Resume upload: {{ pendingUpload.fileName }}
          </p>
          <p class="text-dot-text-secondary">
            {{ pendingUpload.completedChunks }} of {{ pendingUpload.totalChunks }} chunks already on
            chain. Drop or select
            <span class="font-medium text-dot-text-primary">{{ pendingUpload.fileName }}</span>
            again to pick up where you left off. Completed chunks are skipped automatically.
          </p>
          <div class="flex flex-col sm:flex-row gap-2 mt-3">
            <Button size="sm" @click="resumePendingUpload">
              Re-upload {{ pendingUpload.fileName }}
            </Button>
            <Button size="sm" variant="secondary" @click="discardPendingUpload">
              Discard &amp; start fresh
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!selectedFile && bulletinStore.uploadStage === 'idle'"
      class="border border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors"
      :class="[
        isDragging
          ? 'border-dot-accent bg-dot-accent/5'
          : 'border-dot-border hover:border-dot-border-strong',
      ]"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      @click="openFileDialog"
    >
      <input ref="fileInputRef" type="file" class="hidden" @change="handleFileInput" />
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
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
      <p class="text-dot-text-secondary text-sm mb-1">
        {{
          mode === "folder" ? "Drop a folder or click to select" : "Drop a file or click to select"
        }}
      </p>
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
          <p class="text-dot-text-tertiary text-xs">
            {{ bulletinStore.formatBytes(selectedFile.size) }}
            <span v-if="uploadPlan" class="text-dot-text-tertiary">
              &middot; {{ uploadPlan?.totalApprovalCount ?? 0 }} approvals
            </span>
            <span v-if="isChunked" class="text-dot-text-tertiary">
              &middot; {{ uploadPlan?.chunkCount ?? 0 }} chunks
            </span>
          </p>
        </div>
        <button
          v-if="!bulletinStore.isUploading"
          @click="removeFile"
          class="p-1 rounded text-dot-text-tertiary hover:text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors"
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
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-dot-text-tertiary">
            Browser limit
          </p>
          <p class="mt-2 text-sm font-medium text-dot-text-primary">
            {{ browserUploadLimitLabel }}
          </p>
        </div>

        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-dot-text-tertiary">
            Wallet approvals
          </p>
          <p class="mt-2 text-sm font-medium text-dot-text-primary">
            {{ uploadPlan?.totalApprovalCount ?? 0 }}
          </p>
        </div>

        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-dot-text-tertiary">
            Upload mode
          </p>
          <p class="mt-2 text-sm font-medium text-dot-text-primary">
            {{ isChunked ? "Chunked file upload" : "Single file upload" }}
          </p>
        </div>
      </div>

      <div
        v-if="exceedsBrowserLimit"
        class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2"
      >
        <p class="text-sm font-medium text-red-400">Browser upload limit reached</p>
        <p class="text-xs text-dot-text-secondary">
          This file is {{ bulletinStore.formatBytes(selectedFile.size) }}. Browser uploads are
          limited to {{ browserUploadLimitLabel }} to keep approvals and memory usage manageable.
          Use the CLI for anything larger.
        </p>
        <a
          :href="RELEASES_URL"
          target="_blank"
          rel="noopener"
          class="inline-flex h-9 items-center justify-center rounded-lg border border-dot-border px-3 text-xs font-medium text-dot-text-primary transition-colors hover:bg-dot-surface-secondary"
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
          class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm text-left w-full transition-colors"
          :class="
            acceptedApprovalPrompt
              ? 'border-dot-accent/40 bg-dot-accent/5 text-dot-text-primary cursor-default'
              : 'border-dot-border bg-dot-bg text-dot-text-secondary hover:border-dot-accent/30 cursor-pointer'
          "
          :disabled="acceptedApprovalPrompt"
          @click="!acceptedApprovalPrompt && (acceptedApprovalPrompt = true)"
        >
          <span
            class="h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors"
            :class="
              acceptedApprovalPrompt
                ? 'bg-dot-accent border-dot-accent'
                : 'border-dot-border bg-dot-surface'
            "
          >
            <svg
              v-if="acceptedApprovalPrompt"
              class="h-2.5 w-2.5 text-white"
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
            <span v-if="bulletinStore.chunksTotal > 1" class="text-dot-text-tertiary text-xs">
              {{ bulletinStore.chunksCompleted }}/{{ bulletinStore.chunksTotal }}
            </span>
            <span class="text-dot-text-tertiary text-xs">
              {{ bulletinStore.uploadProgress }}%
            </span>
          </div>
        </div>
      </div>

      <Button
        v-if="!bulletinStore.isUploading && bulletinStore.uploadStage !== 'done'"
        @click="startUpload"
        :disabled="!canUpload"
        variant="primary"
        :full-width="true"
      >
        {{ exceedsBrowserLimit ? "Use CLI for This Upload" : "Upload to Bulletin Chain" }}
      </Button>

      <div
        v-if="bulletinStore.uploadStage === 'done' && bulletinStore.uploadedCid"
        class="bg-green-500/10 border border-green-500/20 rounded-lg p-3"
      >
        <p class="text-green-400 text-sm font-medium mb-1">Upload complete</p>
        <p class="text-dot-text-tertiary text-xs font-mono break-all">
          {{ bulletinStore.uploadedCid }}
        </p>
        <p v-if="verificationMessage" class="text-dot-text-tertiary text-xs mt-2">
          {{ verificationMessage }}
        </p>
      </div>
    </div>

    <div
      v-if="bulletinStore.uploadError"
      class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-2"
    >
      <p class="text-red-400 text-sm">{{ bulletinStore.uploadError }}</p>
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
            class="text-dot-accent hover:underline"
            >Install the CLI</a
          >
          then run:
        </p>
        <div class="flex items-center gap-2 bg-dot-bg rounded px-2 py-1.5 mt-1">
          <code class="font-mono text-dot-text-secondary text-xs flex-1 break-all">
            {{ authorizeCommand }}
          </code>
          <button
            @click="copyAuthorizeCommand"
            class="p-1 rounded text-dot-text-tertiary hover:text-dot-text-secondary shrink-0 transition-colors"
            title="Copy command"
          >
            <svg
              v-if="copiedAuthorize"
              class="w-3.5 h-3.5 text-green-400"
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
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          class="text-dot-accent hover:underline inline-block mt-1"
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
        class="text-dot-text-secondary text-xs hover:text-dot-text-primary transition-colors"
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
  </div>
</template>
