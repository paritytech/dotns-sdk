<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRoute } from "vue-router";
import LoadingScreen from "../components/preview/LoadingScreen.vue";
import ContentDisplay from "../components/preview/ContentDisplay.vue";
import ErrorDisplay from "../components/preview/ErrorDisplay.vue";
import LandingPage from "../components/preview/LandingPage.vue";

const route = useRoute();

const isLoading = ref(false);
const error = ref<string | null>(null);
const contentUrl = ref<string | null>(null);
const contentType = ref<string | null>(null);
const contentBlob = ref<Blob | null>(null);

const IPFS_GATEWAYS = ["https://ipfs.io"];

const successfulGateway = ref(IPFS_GATEWAYS[0]);

function decodeFromPreview(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(base64 + padding);
}

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
  if (!cid.value) return "";
  return `${successfulGateway.value}/ipfs/${cid.value}/`;
});

async function fetchContent() {
  if (!cid.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;

  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = `${gateway}/ipfs/${cid.value}/`;
      const response = await fetch(url);

      if (!response.ok) {
        continue;
      }

      const type = response.headers.get("content-type") || "application/octet-stream";
      contentType.value = type;

      const blob = await response.blob();
      contentBlob.value = blob;
      contentUrl.value = URL.createObjectURL(blob);
      successfulGateway.value = gateway;

      isLoading.value = false;
      return;
    } catch {
      continue;
    }
  }

  error.value =
    "Content not found on IPFS gateways. It may still be propagating from Bulletin chain.";
  isLoading.value = false;
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
</script>

<template>
  <div class="min-h-screen">
    <LandingPage v-if="!encodedParam" />

    <LoadingScreen v-else-if="isLoading" />

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
