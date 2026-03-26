<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import LoadingScreen from "../components/preview/LoadingScreen.vue";
import ContentDisplay from "../components/preview/ContentDisplay.vue";
import ErrorDisplay from "../components/preview/ErrorDisplay.vue";
import LandingPage from "../components/preview/LandingPage.vue";
import { decodeFromPreview } from "@/lib/preview";
import { destroySharedHeliaClient } from "@/lib/heliaClient";
import {
  fetchCidFromP2P,
  fetchCidFromGateways,
  IPFS_GATEWAYS,
  IpfsContentTooLargeError,
  MAX_INLINE_PREVIEW_BYTES,
} from "@/lib/ipfs";

function detectMimeType(data: Uint8Array): string {
  if (data.length < 4) return "application/octet-stream";

  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46)
    return data[8] === 0x57 ? "image/webp" : "video/webm";
  if (data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)
    return "application/pdf";
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3)
    return "video/webm";
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70)
    return "video/mp4";
  if (data[0] === 0x3c) return "text/html";
  if (data[0] === 0x7b) return "application/json";

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data.slice(0, 512));
    return "text/plain";
  } catch (error) {
    console.warn("[PreviewView] UTF-8 detection failed, treating as binary:", error);
    return "application/octet-stream";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const route = useRoute();

const isLoading = ref(false);
const loadingMessage = ref("Loading your content preview");
const error = ref<string | null>(null);
const contentUrl = ref<string | null>(null);
const contentType = ref<string | null>(null);
const contentBlob = ref<Blob | null>(null);
const resolvedGatewayUrl = ref<string | null>(null);
const previewUnavailableReason = ref<string | null>(null);
let previewRequestId = 0;
let activeFetchController: AbortController | null = null;
let mountTimer: ReturnType<typeof setTimeout> | null = null;

const encodedParam = computed(() => route.params.encoded as string | undefined);

const cid = computed(() => {
  if (!encodedParam.value) return null;
  try {
    return decodeFromPreview(encodedParam.value);
  } catch (error) {
    console.warn("[PreviewView] Failed to decode preview param:", error);
    return null;
  }
});

const gatewayUrl = computed(() => {
  return resolvedGatewayUrl.value ?? "";
});

function resetResolvedContent(): void {
  if (contentUrl.value?.startsWith("blob:")) {
    URL.revokeObjectURL(contentUrl.value);
  }

  contentUrl.value = null;
  contentType.value = null;
  contentBlob.value = null;
  resolvedGatewayUrl.value = null;
  previewUnavailableReason.value = null;
}

function clearMountTimer(): void {
  if (mountTimer) {
    clearTimeout(mountTimer);
    mountTimer = null;
  }
}

function abortActiveFetch(): void {
  if (activeFetchController) {
    activeFetchController.abort();
    activeFetchController = null;
  }
}

function cleanupPreviewTransport(): void {
  clearMountTimer();
  abortActiveFetch();
  void destroySharedHeliaClient().catch(() => {
    // best-effort teardown
  });
}

async function fetchContent() {
  if (!cid.value) {
    return;
  }

  const requestId = ++previewRequestId;
  abortActiveFetch();
  const fetchController = new AbortController();
  activeFetchController = fetchController;

  isLoading.value = true;
  error.value = null;
  resetResolvedContent();

  try {
    let blob: Blob | null = null;
    let type = "application/octet-stream";
    let resolvedUrl = "";
    let blockedReason: string | null = null;

    loadingMessage.value = "Fetching content from IPFS gateways...";
    try {
      const resolvedContent = await fetchCidFromGateways(cid.value, {
        signal: fetchController.signal,
        maxBytes: MAX_INLINE_PREVIEW_BYTES,
      });
      type = resolvedContent.contentType;
      blob = resolvedContent.blob;
      resolvedUrl = resolvedContent.url;
    } catch (gatewayError) {
      if (gatewayError instanceof IpfsContentTooLargeError) {
        blockedReason = gatewayError.message;
        type = gatewayError.contentType || type;
        resolvedUrl = gatewayError.url;
      } else {
        console.warn("[PreviewView] Gateway fetch failed:", gatewayError);
      }
    }

    if (requestId !== previewRequestId || fetchController.signal.aborted) {
      return;
    }

    if (!blob && !blockedReason) {
      loadingMessage.value = "Connecting to Bulletin P2P...";
      try {
        const p2pResult = await fetchCidFromP2P(cid.value, {
          signal: fetchController.signal,
          maxBytes: MAX_INLINE_PREVIEW_BYTES,
        });
        type = detectMimeType(p2pResult.sniffBytes);
        blob = p2pResult.blob.slice(0, p2pResult.size, type);
        resolvedUrl = `${IPFS_GATEWAYS[0]}/ipfs/${cid.value}/`;
      } catch (p2pError) {
        if (
          p2pError instanceof Error &&
          p2pError.message.includes(
            `Content exceeds preview limit of ${MAX_INLINE_PREVIEW_BYTES} bytes`,
          )
        ) {
          blockedReason = `Preview unavailable: content is above the inline preview limit of ${formatBytes(MAX_INLINE_PREVIEW_BYTES)}.`;
          resolvedUrl = `${IPFS_GATEWAYS[0]}/ipfs/${cid.value}/`;
        } else {
          console.warn("[PreviewView] P2P fetch failed:", p2pError);
        }
      }
    }

    if (requestId !== previewRequestId || fetchController.signal.aborted) {
      return;
    }

    contentType.value = type;
    contentBlob.value = blob;
    previewUnavailableReason.value = blockedReason;
    if (blob) {
      contentUrl.value = URL.createObjectURL(blob);
    } else if (blockedReason) {
      contentUrl.value = resolvedUrl || `${IPFS_GATEWAYS[0]}/ipfs/${cid.value}/`;
    } else {
      error.value =
        "Content not found on IPFS gateways. It may still be propagating from Bulletin chain.";
    }
    resolvedGatewayUrl.value = resolvedUrl;
  } catch (fetchError) {
    if (requestId !== previewRequestId || fetchController.signal.aborted) {
      return;
    }
    console.warn("[PreviewView] Content fetch failed:", fetchError);
    error.value =
      "Content not found on IPFS gateways. It may still be propagating from Bulletin chain.";
  } finally {
    if (activeFetchController === fetchController) {
      activeFetchController = null;
    }
    if (requestId === previewRequestId) {
      isLoading.value = false;
    }
  }
}

function handleRetry() {
  clearMountTimer();
  fetchContent();
}

watch(
  encodedParam,
  () => {
    if (encodedParam.value) {
      clearMountTimer();
      fetchContent();
    } else {
      cleanupPreviewTransport();
      resetResolvedContent();
    }
  },
  { immediate: false },
);

function handlePageHide(): void {
  cleanupPreviewTransport();
}

onMounted(() => {
  window.addEventListener("pagehide", handlePageHide);
  if (encodedParam.value) {
    mountTimer = setTimeout(() => {
      mountTimer = null;
      fetchContent();
    }, 800);
    isLoading.value = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", handlePageHide);
  cleanupPreviewTransport();
  resetResolvedContent();
});
</script>

<template>
  <div class="min-h-screen bg-dot-bg">
    <LandingPage v-if="!encodedParam" />

    <Transition name="preview-fade" mode="out-in">
      <LoadingScreen v-if="encodedParam && isLoading" :message="loadingMessage" key="loading" />

      <ErrorDisplay
        v-else-if="encodedParam && error"
        :message="error"
        :cid="cid || ''"
        key="error"
        @retry="handleRetry"
      />

      <ContentDisplay
        v-else-if="encodedParam && contentUrl && contentType"
        :url="contentUrl"
        :content-type="contentType"
        :blob="contentBlob"
        :cid="cid || ''"
        :gateway-url="gatewayUrl"
        :preview-unavailable-reason="previewUnavailableReason"
        key="content"
      />
    </Transition>
  </div>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.25s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
