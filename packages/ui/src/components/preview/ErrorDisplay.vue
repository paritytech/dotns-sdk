<script setup lang="ts">
defineProps<{
  message: string;
  cid: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-6 bg-dot-bg animate-fade-in">
    <div class="text-center max-w-md w-full">
      <div
        class="w-16 h-16 mx-auto mb-6 rounded-full bg-dot-surface border border-dot-border flex items-center justify-center"
      >
        <svg
          class="w-8 h-8 text-dot-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h1 class="text-3xl font-serif text-dot-text-primary mb-2">Dotns</h1>
      <h2 class="text-xl text-dot-text-secondary mb-2">Failed to Load Content</h2>
      <p class="text-dot-text-tertiary mb-6">{{ message }}</p>

      <div v-if="cid" class="mb-8 p-4 bg-dot-surface border border-dot-border rounded-lg text-left">
        <p class="text-xs text-dot-text-tertiary mb-1">CID</p>
        <p class="font-mono text-sm text-dot-text-primary break-all">
          {{ cid }}
        </p>
      </div>

      <button
        @click="emit('retry')"
        class="px-6 py-3 bg-dot-surface-secondary hover:bg-dot-border text-dot-text-primary rounded border border-dot-border transition-colors"
      >
        Try Again
      </button>
    </div>
  </div>
</template>
