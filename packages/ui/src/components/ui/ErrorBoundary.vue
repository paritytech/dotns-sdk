<template>
  <slot v-if="!error" />
  <div v-else class="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
    <div class="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-6">
      <Icon name="AlertTriangle" size="xl" class="text-error" />
    </div>

    <h1 class="text-2xl font-semibold text-dot-text-primary mb-2">Something Went Wrong</h1>

    <p class="text-dot-text-secondary text-sm max-w-md mb-2">
      {{ formattedMessage }}
    </p>

    <p v-if="errorInfo" class="text-dot-text-tertiary text-xs font-mono max-w-md mb-8 break-all">
      {{ errorInfo }}
    </p>

    <div class="flex gap-3">
      <Button variant="primary" @click="retry">Try Again</Button>
      <Button variant="secondary" @click="reloadApp">Reload Page</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onErrorCaptured, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "./Icon.vue";
import Button from "./Button.vue";
import { formatErrorMessage } from "@/lib/errorHandling";

const route = useRoute();

const error = ref<Error | null>(null);
const errorInfo = ref("");
const formattedMessage = computed(() => (error.value ? formatErrorMessage(error.value) : ""));

onErrorCaptured((err: Error, _instance, info) => {
  error.value = err;
  errorInfo.value = info;
  return false;
});

watch(
  () => route.fullPath,
  () => {
    error.value = null;
    errorInfo.value = "";
  },
);

function retry() {
  error.value = null;
  errorInfo.value = "";
}

function reloadApp() {
  window.location.reload();
}
</script>
