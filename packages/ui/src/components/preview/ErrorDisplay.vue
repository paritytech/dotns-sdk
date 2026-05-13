<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  message: string;
  cid: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const copiedCid = ref(false);
const retrying = ref(false);

async function copyCid(text: string) {
  await navigator.clipboard.writeText(text);
  copiedCid.value = true;
  setTimeout(() => (copiedCid.value = false), 2000);
}

function handleRetry() {
  retrying.value = true;
  emit("retry");
  setTimeout(() => (retrying.value = false), 1500);
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center p-6 bg-dot-bg animate-fade-in">
    <div class="max-w-md w-full">
      <div class="bg-dot-surface border border-dot-border rounded-lg p-4 sm:p-6">
        <div class="flex items-start gap-3 mb-4">
          <div
            class="w-10 h-10 flex-shrink-0 rounded-lg bg-dot-surface-secondary border border-dot-border flex items-center justify-center"
          >
            <svg
              class="w-5 h-5 text-dot-text-tertiary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <h2 class="text-dot-text-primary font-medium mb-1">Content Unavailable</h2>
            <p class="text-sm text-dot-text-tertiary leading-relaxed">{{ message }}</p>
          </div>
        </div>

        <div v-if="cid" class="mb-4 p-3 bg-dot-bg border border-dot-border rounded-lg">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[11px] text-dot-text-tertiary uppercase tracking-wider">CID</span>
            <button
              class="text-[11px] text-dot-accent hover:text-dot-accent-hover transition-colors cursor-pointer"
              @click="copyCid(cid)"
            >
              {{ copiedCid ? "Copied" : "Copy" }}
            </button>
          </div>
          <code
            class="font-mono text-xs text-dot-text-secondary break-all select-all leading-relaxed"
          >
            {{ cid }}
          </code>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <button
            @click="handleRetry"
            :disabled="retrying"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-dot-surface-secondary hover:bg-dot-border disabled:opacity-50 text-dot-text-primary rounded-lg border border-dot-border transition-colors text-sm font-medium"
          >
            <svg
              class="w-4 h-4"
              :class="{ 'animate-spin': retrying }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {{ retrying ? "Retrying..." : "Try Again" }}
          </button>
          <a
            v-if="cid"
            :href="`https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/${cid}/`"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-dot-text-secondary hover:text-dot-text-primary rounded-lg border border-dot-border hover:border-dot-border-strong transition-colors text-sm"
          >
            Open Gateway
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>

      <p class="text-center text-[11px] text-dot-text-tertiary mt-4">
        Content may still be propagating across IPFS nodes. Try again in a few moments.
      </p>
    </div>
  </div>
</template>
