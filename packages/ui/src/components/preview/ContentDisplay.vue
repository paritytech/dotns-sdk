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
const copiedLink = ref(false);
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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

const truncatedCid = computed(() => {
  if (props.cid.length <= 24) return props.cid;
  return `${props.cid.slice(0, 12)}...${props.cid.slice(-8)}`;
});

function handleDownload() {
  const link = document.createElement("a");
  link.href = props.url;
  link.download = props.cid;
  link.click();
}

async function copyToClipboard(text: string, target: "link" | "cid") {
  await navigator.clipboard.writeText(text);
  if (target === "link") {
    copiedLink.value = true;
    setTimeout(() => (copiedLink.value = false), 2000);
  } else {
    copiedCid.value = true;
    setTimeout(() => (copiedCid.value = false), 2000);
  }
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
      <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-5 mb-4 sm:mb-6">
        <div class="flex flex-col gap-3">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-dot-text-primary font-medium text-sm">Content Link</span>
              <span
                class="text-[11px] text-dot-text-tertiary bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >
                {{ contentType }}
              </span>
            </div>
            <span class="text-xs text-dot-text-tertiary tabular-nums">{{ fileSize }}</span>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div
              class="flex-1 flex items-center gap-2 bg-dot-bg border border-dot-border rounded-lg px-3 py-2.5 min-w-0"
            >
              <svg
                class="w-3.5 h-3.5 text-dot-text-tertiary flex-shrink-0 hidden sm:block"
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
              <a
                :href="gatewayUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-dot-text-secondary hover:text-dot-text-primary truncate text-xs sm:text-sm transition-colors"
              >
                {{ gatewayUrl }}
              </a>
            </div>
            <div class="flex gap-2">
              <button
                @click="copyToClipboard(gatewayUrl, 'link')"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2.5 bg-dot-surface-secondary hover:bg-dot-border active:bg-dot-border-strong rounded-lg border border-dot-border transition-colors text-sm"
                :title="copiedLink ? 'Copied!' : 'Copy link'"
              >
                <svg
                  v-if="!copiedLink"
                  class="w-4 h-4 text-dot-text-primary"
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
                  class="w-4 h-4 text-dot-text-primary"
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
                <span class="sm:hidden text-dot-text-primary">Copy</span>
              </button>
              <button
                @click="handleDownload"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2.5 bg-dot-surface-secondary hover:bg-dot-border active:bg-dot-border-strong rounded-lg border border-dot-border transition-colors text-sm"
                title="Download"
              >
                <svg
                  class="w-4 h-4 text-dot-text-primary"
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
                <span class="sm:hidden text-dot-text-primary">Download</span>
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1 border-t border-dot-border">
            <span class="text-[11px] text-dot-text-tertiary uppercase tracking-wider flex-shrink-0"
              >CID</span
            >
            <code class="text-dot-text-secondary font-mono truncate flex-1 text-xs" :title="cid">
              {{ truncatedCid }}
            </code>
            <button
              @click="copyToClipboard(cid, 'cid')"
              class="text-[11px] text-dot-accent hover:text-dot-accent-hover transition-colors flex-shrink-0"
            >
              {{ copiedCid ? "Copied" : "Copy" }}
            </button>
          </div>
        </div>
      </div>

      <div class="bg-dot-surface border border-dot-border rounded-lg overflow-hidden">
        <div
          v-if="isImage"
          class="flex items-center justify-center p-4 sm:p-6 bg-dot-bg min-h-[250px] sm:min-h-[400px]"
        >
          <img
            :src="url"
            :alt="`Preview of ${truncatedCid}`"
            class="max-w-full max-h-[50vh] sm:max-h-[60vh] object-contain rounded"
            loading="eager"
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
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[250px]"
        >
          <div class="w-full max-w-md">
            <div
              class="w-14 h-14 mx-auto mb-5 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg class="w-6 h-6 text-dot-text-secondary" fill="currentColor" viewBox="0 0 24 24">
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

        <div v-else-if="isPdf || isHtml" class="relative">
          <div
            v-if="iframeLoading"
            class="absolute inset-0 flex items-center justify-center bg-dot-bg z-10"
          >
            <svg class="w-8 h-8" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="#292524" stroke-width="2" />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#a8a29e"
                stroke-width="2"
                stroke-linecap="round"
                class="animate-loader-combined"
              />
            </svg>
          </div>
          <iframe
            :src="gatewayUrl"
            class="w-full h-[50vh] sm:h-[70vh]"
            :class="{ 'bg-white': isHtml }"
            :title="isPdf ? 'PDF Preview' : 'HTML Preview'"
            :allow="isHtml ? 'fullscreen' : undefined"
            :referrerpolicy="isHtml ? 'no-referrer' : undefined"
            @load="onIframeLoad"
            @error="onIframeError"
          />
        </div>

        <div
          v-else-if="isText && textContent"
          class="max-h-[50vh] sm:max-h-[60vh] overflow-auto p-4 sm:p-6 bg-dot-bg"
        >
          <pre
            class="font-mono text-xs sm:text-sm text-dot-text-secondary whitespace-pre-wrap break-words leading-relaxed"
            >{{ textContent }}</pre
          >
        </div>

        <div
          v-else-if="isUnknown || iframeError"
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[300px]"
        >
          <div class="text-center">
            <div
              class="w-14 h-14 mx-auto mb-4 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
            >
              <svg
                class="w-6 h-6 text-dot-text-tertiary"
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
            </div>
            <p class="text-dot-text-secondary text-sm mb-1">
              Preview not available for this file type
            </p>
            <p class="text-xs text-dot-text-tertiary mb-5">
              Download the file to view its contents
            </p>
            <button
              @click="handleDownload"
              class="inline-flex items-center gap-2 px-4 py-2 bg-dot-surface-secondary hover:bg-dot-border active:bg-dot-border-strong rounded-lg border border-dot-border transition-colors text-dot-text-primary text-sm"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download
            </button>
          </div>
        </div>

        <div
          v-else
          class="flex items-center justify-center p-6 sm:p-8 min-h-[200px] sm:min-h-[300px]"
        >
          <svg class="w-8 h-8" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="#292524" stroke-width="2" />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="#a8a29e"
              stroke-width="2"
              stroke-linecap="round"
              class="animate-loader-combined"
            />
          </svg>
        </div>
      </div>
    </main>
  </div>
</template>
