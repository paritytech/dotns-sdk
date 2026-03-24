<script setup lang="ts">
import { ref, onMounted, computed, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import LoadingScreen from "../components/preview/LoadingScreen.vue";
import ContentDisplay from "../components/preview/ContentDisplay.vue";
import ErrorDisplay from "../components/preview/ErrorDisplay.vue";
import LandingPage from "../components/preview/LandingPage.vue";
import { decodeFromPreview } from "@/lib/preview";
import { fetchCidFromP2P, fetchCidFromGateways } from "@/lib/ipfs";

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
  } catch {
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

const encodedParam = computed(() => route.params.encoded as string | undefined);

const cid = computed(() => {
  if (!encodedParam.value) return null;
  try {
    return decodeFromPreview(encodedParam.value);
  } catch {
    return null;
  }
});

const gatewayUrl = computed(() => {
  return resolvedGatewayUrl.value ?? "";
});

function resetResolvedContent(): void {
  if (contentUrl.value) {
    URL.revokeObjectURL(contentUrl.value);
  }

  contentUrl.value = null;
  contentType.value = null;
  contentBlob.value = null;
  resolvedGatewayUrl.value = null;
}

async function fetchContent() {
  if (!cid.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;
  resetResolvedContent();

  try {
    let blob: Blob | null = null;
    let type = "application/octet-stream";
    let resolvedUrl = "";

    loadingMessage.value = "Connecting to Bulletin P2P...";
    try {
      const p2pResult = await fetchCidFromP2P(cid.value);
      type = detectMimeType(p2pResult.data);
      blob = new Blob([new Uint8Array(p2pResult.data) as unknown as BlobPart], { type });
      resolvedUrl = `p2p://${cid.value}`;
    } catch {
      /* noop */
    }

    if (!blob) {
      loadingMessage.value = "Fetching content from IPFS gateways...";
      const resolvedContent = await fetchCidFromGateways(cid.value);
      type = resolvedContent.response.headers.get("content-type") || "application/octet-stream";
      blob = await resolvedContent.response.blob();
      resolvedUrl = resolvedContent.url;
    }

    loadingMessage.value = "Fetching content...";
    contentType.value = type;
    contentBlob.value = blob;
    contentUrl.value = URL.createObjectURL(blob);
    resolvedGatewayUrl.value = resolvedUrl;
  } catch {
    error.value =
      "Content not found on IPFS gateways. It may still be propagating from Bulletin chain.";
  } finally {
    isLoading.value = false;
  }
}

function handleRetry() {
  fetchContent();
}

watch(
  encodedParam,
  () => {
    if (encodedParam.value) {
      fetchContent();
    }
  },
  { immediate: false },
);

onMounted(() => {
  if (encodedParam.value) {
    setTimeout(() => {
      fetchContent();
    }, 800);
    isLoading.value = true;
  }
});

onBeforeUnmount(() => {
  resetResolvedContent();
});
</script>

<template>
  <div class="min-h-screen">
    <LandingPage v-if="!encodedParam" />

    <LoadingScreen v-else-if="isLoading" :message="loadingMessage" />

    <ErrorDisplay v-else-if="error" :message="error" :cid="cid || ''" @retry="handleRetry" />

    <ContentDisplay
      v-else-if="contentUrl && contentType"
      :url="contentUrl"
      :content-type="contentType"
      :blob="contentBlob"
      :cid="cid || ''"
      :gateway-url="gatewayUrl"
    />
  </div>
</template>
