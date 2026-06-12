<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import LoadingScreen from "../components/preview/LoadingScreen.vue";
import ContentDisplay from "../components/preview/ContentDisplay.vue";
import ErrorDisplay from "../components/preview/ErrorDisplay.vue";
import LandingPage from "../components/preview/LandingPage.vue";
import { decodeFromPreview } from "@/lib/preview";
import { getPreviewContent, clearPreviewContent } from "@/lib/previewCache";
import { fetchCidContentViaHost } from "@/lib/hostPreimage";
import { IpfsContentTooLargeError, MAX_INLINE_PREVIEW_BYTES } from "@/lib/ipfs";

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

function abortActiveFetch(): void {
  if (activeFetchController) {
    activeFetchController.abort();
    activeFetchController = null;
  }
}

function cleanupPreviewTransport(): void {
  abortActiveFetch();
}

async function fetchContent() {
  if (!cid.value) {
    error.value = "This preview link is malformed.";
    isLoading.value = false;
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
    let blockedReason: string | null = null;

    // Post-upload hand-off: if we still hold the uploaded bytes, render them
    // directly — no gateway or host round-trip needed.
    const cached = getPreviewContent(cid.value);
    if (cached) {
      blob = cached.blob;
      type =
        cached.contentType && cached.contentType !== "application/octet-stream"
          ? cached.contentType
          : detectMimeType(new Uint8Array(await cached.blob.slice(0, 512).arrayBuffer()));
    }

    if (!blob && !blockedReason) {
      loadingMessage.value = "Fetching content via the host...";
      try {
        const bytes = await fetchCidContentViaHost(cid.value, {
          signal: fetchController.signal,
          maxBytes: MAX_INLINE_PREVIEW_BYTES,
        });
        type = detectMimeType(bytes);
        blob = new Blob([bytes as BlobPart], { type });
      } catch (hostError) {
        if (hostError instanceof IpfsContentTooLargeError) {
          blockedReason = hostError.message;
          type = hostError.contentType || type;
        } else {
          console.warn("[PreviewView] Host content fetch failed:", hostError);
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
      contentUrl.value = "";
    } else {
      error.value = "Content not retrievable via the host. It may still be propagating.";
    }
    // Shareable link to the pre-allowed Parity gateway (user-clicked, not an
    // auto-fetch) — content itself renders from the local host-fetched blob above.
    resolvedGatewayUrl.value = `https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/${cid.value}`;
  } catch (fetchError) {
    if (requestId !== previewRequestId || fetchController.signal.aborted) {
      return;
    }
    console.warn("[PreviewView] Content fetch failed:", fetchError);
    error.value = "Content not retrievable via the host. It may still be propagating.";
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
  fetchContent();
}

// immediate so the fetch runs on first mount AND when the param changes on a
// reused component instance (e.g. /upload → /preview/:encoded), which onMounted
// alone would miss.
watch(
  encodedParam,
  () => {
    if (encodedParam.value) {
      fetchContent();
    } else {
      cleanupPreviewTransport();
      resetResolvedContent();
    }
  },
  { immediate: true },
);

function handlePageHide(): void {
  cleanupPreviewTransport();
}

onMounted(() => {
  window.addEventListener("pagehide", handlePageHide);
});

onBeforeUnmount(() => {
  window.removeEventListener("pagehide", handlePageHide);
  cleanupPreviewTransport();
  resetResolvedContent();
  clearPreviewContent();
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

      <ErrorDisplay
        v-else-if="encodedParam"
        :message="error || 'Preview unavailable.'"
        :cid="cid || ''"
        key="fallback"
        @retry="handleRetry"
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
