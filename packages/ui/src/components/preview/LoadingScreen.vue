<script setup lang="ts">
import { ref, onMounted } from "vue";

withDefaults(
  defineProps<{
    message?: string;
  }>(),
  {
    message: "Loading your content preview",
  },
);

const visible = ref(false);

onMounted(() => {
  requestAnimationFrame(() => {
    visible.value = true;
  });
});
</script>

<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center p-6 bg-dot-bg transition-opacity duration-500"
    :class="visible ? 'opacity-100' : 'opacity-0'"
  >
    <div class="text-center max-w-sm w-full">
      <div class="relative w-8 h-8 mx-auto mb-6">
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

      <p class="text-dot-text-secondary text-sm mb-2">{{ message }}</p>

      <div class="w-48 mx-auto mt-4">
        <div class="h-px bg-dot-surface-secondary rounded-full overflow-hidden">
          <div class="h-full w-1/3 bg-dot-text-tertiary rounded-full animate-loading-bar"></div>
        </div>
      </div>
    </div>
  </div>
</template>
