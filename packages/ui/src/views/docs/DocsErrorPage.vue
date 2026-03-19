<template>
  <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
    <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-6">
      <Icon name="AlertTriangle" size="xl" class="text-error" />
    </div>

    <p v-if="isNotFound" class="text-5xl font-bold text-dot-accent mb-4">404</p>

    <h1 class="text-2xl font-semibold text-dot-text-primary mb-2">
      {{ isNotFound ? "Page Not Found" : "Failed to Load Page" }}
    </h1>

    <p class="text-dot-text-secondary text-sm max-w-md mb-2">
      {{ errorMessage }}
    </p>

    <p v-if="!isNotFound" class="text-dot-text-tertiary text-xs max-w-md mb-8">
      Try again or reload to get the latest version.
    </p>

    <div v-if="isNotFound" class="flex gap-3 mt-6">
      <Button variant="primary" @click="router.push('/docs/introduction')">
        Go to Introduction
      </Button>
    </div>

    <div v-else class="flex gap-3">
      <Button variant="primary" @click="retryNavigation">Try Again</Button>
      <Button variant="secondary" @click="reloadApp">Reload Page</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";

const route = useRoute();
const router = useRouter();

const isNotFound = computed(() => route.name === "DocsNotFound" && !route.query.message);

const failedPath = typeof route.query.path === "string" ? route.query.path : "/docs/introduction";

const errorMessage = computed(() => {
  if (isNotFound.value) {
    return "The docs page you're looking for doesn't exist or has been moved.";
  }
  return typeof route.query.message === "string"
    ? route.query.message
    : "The page could not be loaded due to a network error or an app update.";
});

function retryNavigation() {
  router.replace(failedPath);
}

function reloadApp() {
  window.location.reload();
}
</script>
