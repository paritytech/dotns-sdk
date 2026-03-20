<template>
  <div
    v-if="transactionStatus === 'idle'"
    class="fixed top-0 left-0 w-full h-1 z-[999999] overflow-hidden"
    v-show="isLoading"
  >
    <div
      class="w-full h-[200%] bg-dot-accent animate-loading-bar"
      style="background-size: 200% 100%"
    ></div>
  </div>
</template>

<script setup>
import { storeToRefs } from "pinia";
import { useWalletStore } from "../store/useWalletStore";

const walletStore = useWalletStore();
const { isLoading, transactionStatus } = storeToRefs(walletStore);
</script>
