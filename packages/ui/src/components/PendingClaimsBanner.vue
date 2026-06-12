<template>
  <Transition name="slide-fade">
    <div
      v-if="pendingClaims.length > 0"
      class="mb-4 flex flex-col gap-3 rounded-xl border border-dot-accent/30 bg-dot-accent/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex items-start gap-2">
        <Icon name="Info" size="sm" class="mt-0.5 shrink-0 text-dot-accent" />
        <div>
          <p class="text-sm font-medium text-dot-text-primary">
            {{ pendingClaims.length }} name{{ pendingClaims.length === 1 ? "" : "s" }} waiting to
            sync
          </p>
          <p class="text-xs text-dot-text-tertiary font-mono break-all">
            {{ pendingClaims.join(", ") }}
          </p>
        </div>
      </div>
      <Button size="sm" class="shrink-0" :disabled="isSyncing" @click="handleSync">
        {{ isSyncing ? "Syncing..." : "Sync now" }}
      </Button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { type Address } from "viem";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useDomainStore } from "@/store/useDomainStore";

const wallet = useWalletStore();
const domainStore = useDomainStore();
const toast = useToast();

const pendingClaims = ref<string[]>([]);
const isSyncing = ref(false);

async function refresh() {
  if (!wallet.evmAddress) {
    pendingClaims.value = [];
    return;
  }
  pendingClaims.value = await domainStore.getPendingClaims(wallet.evmAddress as Address);
}

async function handleSync() {
  isSyncing.value = true;
  try {
    const result = await domainStore.syncLabelStore();
    if (result.status) {
      toast.success("Names synced into your Label Store");
      await refresh();
    } else {
      toast.error("Sync did not complete");
    }
  } catch (error) {
    console.warn("[PendingClaimsBanner] Sync failed:", error);
    toast.error("Failed to sync names");
  } finally {
    isSyncing.value = false;
  }
}

watch(
  () => wallet.evmAddress,
  () => refresh(),
);

onMounted(refresh);
</script>
