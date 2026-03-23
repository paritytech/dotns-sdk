<template>
  <div class="my-8 border border-dot-border rounded-xl overflow-hidden">
    <div
      class="flex items-center justify-between px-5 py-3 bg-dot-surface border-b border-dot-border"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-dot-accent animate-pulse-ring shrink-0" />
        <span class="text-sm font-medium text-dot-text-primary truncate">{{ title }}</span>
      </div>
      <DocBadge class="shrink-0" :variant="requiresWallet ? 'transaction' : 'no-wallet'">
        {{ requiresWallet ? "Requires Wallet" : "No Wallet Needed" }}
      </DocBadge>
    </div>
    <div class="p-5 bg-dot-bg">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import DocBadge from "./DocBadge.vue";

withDefaults(
  defineProps<{
    title: string;
    requiresWallet?: boolean;
  }>(),
  {
    requiresWallet: false,
  },
);
</script>
