<template>
  <Button
    @click="toggleWallet"
    :disabled="isLoading"
    :loading="isLoading"
    :variant="wallet.isConnected ? 'wallet-connected' : 'wallet'"
    size="sm"
  >
    <template v-if="wallet.isConnected">
      <span class="w-2 h-2 rounded-full animate-pulse bg-success" />
      {{ truncatedAddress }}
    </template>
    <template v-else>Sign in</template>
  </Button>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useToast } from "vue-toastification";
import Button from "@/components/ui/Button.vue";
import { useDomainStore } from "@/store/useDomainStore";

const wallet = useWalletStore();
const toast = useToast();
const isLoading = ref(false);

const truncatedAddress = computed(() => {
  const addr = wallet.substrateAddress;
  if (addr) {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }
  return "";
});

async function toggleWallet() {
  if (wallet.isConnected) {
    disconnect();
  } else {
    await connect();
  }
}

async function connect() {
  try {
    isLoading.value = true;

    if (!wallet.isConnected) {
      await wallet.connectWallet();

      if (wallet.isConnected) {
        toast.success("Wallet connected successfully");
        const domainStore = useDomainStore();
        wallet.userPopState = await domainStore.userPopStatus(wallet.evmAddress!);
      } else {
        toast.warning("No Polkadot compatible wallet is installed");
      }
    }
  } catch (err: any) {
    console.warn("Wallet connection failed:", err);

    const errorMessage = getErrorMessage(err);
    toast.error(errorMessage);
  } finally {
    isLoading.value = false;
  }
}

function disconnect() {
  wallet.handleDisconnect();
  toast.info("Wallet disconnected");
}

function getErrorMessage(error: any): string {
  if (error?.message?.includes("No wallet provider detected")) {
    return "No wallet detected. Please install a wallet compatible with Polkadot";
  }

  if (error?.code === 4001) {
    return "Connection request rejected";
  }

  if (error?.code === -32002) {
    return "Connection request already pending. Check your wallet";
  }

  if (error?.message?.includes("User rejected")) {
    return "Connection cancelled";
  }

  if (error?.message?.includes("network")) {
    return "Network connection failed. Please try again";
  }

  return error?.message || "Failed to connect wallet";
}
</script>
