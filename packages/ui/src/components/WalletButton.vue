<template>
  <div
    v-if="wallet.isConnected"
    class="inline-flex items-center gap-2 h-9 px-3.5 text-xs rounded-lg border border-dot-border bg-dot-surface-secondary text-dot-text-primary"
  >
    <span class="w-2 h-2 rounded-full animate-pulse bg-success" />
    {{ truncatedAddress }}
  </div>
  <div v-else class="inline-flex items-center gap-2 h-9 px-3.5 text-xs text-dot-text-secondary">
    <span class="w-2 h-2 rounded-full bg-dot-border" />
    Not signed in
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useWalletStore } from "@/store/useWalletStore";

const wallet = useWalletStore();

const truncatedAddress = computed(() => {
  const addr = wallet.substrateAddress;
  if (addr) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return "";
});
</script>
