<script setup lang="ts">
import { computed, ref, onMounted, watch } from "vue";

const props = defineProps<{
  url: string;
  contentType: string;
  blob: Blob | null;
  cid: string;
  gatewayUrl: string;
}>();

const textContent = ref<string | null>(null);
const copied = ref(false);
const copiedCid = ref(false);
const iframeLoading = ref(true);
const iframeError = ref(false);

const isImage = computed(() => props.contentType.startsWith("image/"));
const isVideo = computed(() => props.contentType.startsWith("video/"));
const isAudio = computed(() => props.contentType.startsWith("audio/"));
const isPdf = computed(() => props.contentType === "application/pdf");
const isHtml = computed(() => props.contentType.includes("html"));
const isText = computed(
  () =>
    (props.contentType.startsWith("text/") && !isHtml.value) ||
    props.contentType.includes("json") ||
    props.contentType.includes("javascript") ||
    props.contentType.includes("xml"),
);
const isUnknown = computed(
  () =>
    !isImage.value &&
    !isVideo.value &&
    !isAudio.value &&
    !isPdf.value &&
    !isHtml.value &&
    !isText.value,
);

const fileSize = computed(() => {
  if (!props.blob) return "Unknown";
  const bytes = props.blob.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
});

function handleDownload() {
  const link = document.createElement("a");
  link.href = props.url;
  link.download = props.cid;
  link.click();
}

async function copyLink() {
  await navigator.clipboard.writeText(props.gatewayUrl);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

async function copyCid() {
  await navigator.clipboard.writeText(props.cid);
  copiedCid.value = true;
  setTimeout(() => (copiedCid.value = false), 2000);
}

function onIframeLoad() {
  iframeLoading.value = false;
}

function onIframeError() {
  iframeLoading.value = false;
  iframeError.value = true;
}

async function loadTextContent() {
  if (!props.blob) return;
  if (isText.value) {
    textContent.value = await props.blob.text();
  }
}

onMounted(loadTextContent);
watch(() => props.blob, loadTextContent);
</script>

<template>
  <div class="min-h-screen flex flex-col bg-dot-bg animate-fade-in">
    <main class="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
      <div class="flex items-center gap-2 text-dot-text-tertiary text-xs sm:text-sm mb-4 sm:mb-6">
        <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <span>Content served from Bulletin chain via IPFS gateway</span>
      </div>

      <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-5 mb-4 sm:mb-6">
        <div
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4"
        >
          <div class="flex items-center gap-2 text-dot-text-primary">
            <svg
              class="w-5 h-5 text-dot-text-secondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            <span class="font-medium">Your Content Link</span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-xs text-dot-text-tertiary bg-dot-surface-secondary px-2 py-1 rounded border border-dot-border"
            >
              {{ contentType }}
            </span>
            <span class="text-xs text-dot-text-tertiary">
              {{ fileSize }}
            </span>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div
            class="flex-1 flex items-center gap-2 bg-dot-bg border border-dot-border rounded px-3 sm:px-4 py-2 sm:py-3 min-w-0"
          >
            <svg
              class="w-4 h-4 text-dot-text-tertiary flex-shrink-0 hidden sm:block"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
            <a
              :href="gatewayUrl"
              target="_blank"
              class="text-dot-text-secondary hover:text-dot-text-primary hover:underline truncate text-xs sm:text-sm"
            >
              {{ gatewayUrl }}
            </a>
          </div>
          <div class="flex gap-2">
            <button
              @click="copyLink"
              class="flex-1 sm:flex-none p-2 sm:p-3 bg-dot-surface-secondary hover:bg-dot-border rounded border border-dot-border transition-colors flex items-center justify-center gap-2"
              :title="copied ? 'Copied!' : 'Copy link'"
            >
              <svg
                v-if="!copied"
                class="w-5 h-5 text-dot-text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <svg
                v-else
                class="w-5 h-5 text-dot-text-primary"
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
              <span class="sm:hidden text-sm text-dot-text-primary">Copy Link</span>
            </button>
            <button
              @click="handleDownload"
              class="flex-1 sm:flex-none p-2 sm:p-3 bg-dot-surface-secondary hover:bg-dot-border rounded border border-dot-border transition-colors flex items-center justify-center gap-2"
              title="Download"
            >
              <svg
                class="w-5 h-5 text-dot-text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span class="sm:hidden text-sm text-dot-text-primary">Download</span>
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-2 text-xs">
          <span class="text-dot-text-tertiary flex-shrink-0">CID:</span>
          <code class="text-dot-text-secondary font-mono truncate flex-1 text-[10px] sm:text-xs">{{
            cid
          }}</code>
          <button
            @click="copyCid"
            class="text-dot-text-tertiary hover:text-dot-text-primary transition-colors flex-shrink-0"
            :title="copiedCid ? 'Copied!' : 'Copy CID'"
          >
            <svg
              v-if="!copiedCid"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="mb-3 sm:mb-4">
        <h2 class="text-dot-text-primary font-medium text-sm sm:text-base">
          Preview of Your Uploaded Content
        </h2>
      </div>

      <div class="bg-dot-surface border border-dot-border rounded-lg overflow-hidden">
        <div
          v-if="isImage"
          class="flex items-center justify-center p-4 sm:p-6 bg-dot-bg min-h-[250px] sm:min-h-[400px]"
        >
          <img
            :src="url"
            :alt="cid"
            class="max-w-full max-h-[50vh] sm:max-h-[60vh] object-contain rounded"
          />
        </div>

        <div
          v-else-if="isVideo"
          class="flex items-center justify-center p-4 sm:p-6 bg-dot-bg min-h-[250px] sm:min-h-[400px]"
        >
          <video
            :src="url"
            controls
            playsinline
            class="max-w-full max-h-[50vh] sm:max-h-[60vh] rounded w-full"
          >
            Your browser does not support video playback.
          </video>
        </div>

        <div
          v-else-if="isAudio"
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[300px]"
        >
          <div class="text-center w-full max-w-md">
            <div
              class="w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6 rounded-full bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 sm:w-12 sm:h-12 text-dot-text-secondary"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                />
              </svg>
            </div>
            <audio :src="url" controls class="w-full">
              Your browser does not support audio playback.
            </audio>
          </div>
        </div>

        <div v-else-if="isPdf" class="relative">
          <div
            v-if="iframeLoading"
            class="absolute inset-0 flex items-center justify-center bg-dot-bg"
          >
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-dot-text-primary"></div>
          </div>
          <iframe
            :src="gatewayUrl"
            class="w-full h-[50vh] sm:h-[70vh]"
            title="PDF Preview"
            @load="onIframeLoad"
            @error="onIframeError"
          ></iframe>
        </div>

        <div v-else-if="isHtml" class="relative">
          <div
            v-if="iframeLoading"
            class="absolute inset-0 flex items-center justify-center bg-dot-bg z-10"
          >
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-dot-text-primary"></div>
          </div>
          <iframe
            :src="gatewayUrl"
            class="w-full h-[50vh] sm:h-[70vh] bg-white"
            title="HTML Preview"
            allow="fullscreen"
            referrerpolicy="no-referrer"
            @load="onIframeLoad"
            @error="onIframeError"
          ></iframe>
        </div>

        <div
          v-else-if="isText && textContent"
          class="max-h-[50vh] sm:max-h-[60vh] overflow-auto p-4 sm:p-6 bg-dot-bg"
        >
          <pre
            class="font-mono text-xs sm:text-sm text-dot-text-secondary whitespace-pre-wrap break-words"
            >{{ textContent }}</pre
          >
        </div>

        <div
          v-else-if="isUnknown || iframeError"
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[300px]"
        >
          <div class="text-center">
            <div
              class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-xl bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 sm:w-10 sm:h-10 text-dot-text-tertiary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p class="text-dot-text-secondary mb-1 text-sm sm:text-base">
              This file type cannot be previewed
            </p>
            <p class="text-xs sm:text-sm text-dot-text-tertiary mb-4">
              Click download to save the file
            </p>
            <button
              @click="handleDownload"
              class="px-4 py-2 bg-dot-surface-secondary hover:bg-dot-border rounded border border-dot-border transition-colors text-dot-text-primary text-sm"
            >
              Download File
            </button>
          </div>
        </div>

        <div
          v-else
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[300px]"
        >
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-dot-text-primary"></div>
        </div>
      </div>
    </main>
  </div>
</template>
