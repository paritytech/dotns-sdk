<template>
  <div>
    <div class="mb-3">
      <p class="text-dot-text-tertiary text-sm">
        Read and write arbitrary key/value entries in your UserStore. Keys are hashed on-chain, so
        you can look one up by name but the store cannot list them back.
      </p>
    </div>

    <div
      v-if="!wallet.isConnected"
      class="border border-dot-border rounded-xl bg-dot-surface p-8 text-center"
    >
      <p class="text-dot-text-tertiary text-sm">Connect your wallet to manage store entries.</p>
    </div>

    <div v-else class="border border-dot-border rounded-xl bg-dot-surface p-4 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs uppercase tracking-wider text-dot-text-secondary mb-1"
            >Key</label
          >
          <input
            v-model="keyInput"
            type="text"
            placeholder="e.g. profile.theme"
            class="w-full bg-dot-bg border border-dot-border rounded-lg px-3 py-2 text-sm font-mono text-dot-text-primary placeholder:text-dot-text-tertiary placeholder:font-sans focus:outline-none focus:border-dot-accent focus:ring-1 focus:ring-dot-accent/30 transition-colors"
          />
        </div>
        <div>
          <label class="block text-xs uppercase tracking-wider text-dot-text-secondary mb-1"
            >Value</label
          >
          <input
            v-model="valueInput"
            type="text"
            placeholder="value to store"
            class="w-full bg-dot-bg border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-1 focus:ring-dot-accent/30 transition-colors"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button size="sm" :disabled="!keyInput.trim() || busy !== null" @click="handleSet">
          {{ busy === "set" ? "Saving..." : "Save" }}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          :disabled="!keyInput.trim() || busy !== null"
          @click="handleGet"
        >
          {{ busy === "get" ? "Looking up..." : "Look up" }}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          :disabled="!keyInput.trim() || busy !== null"
          @click="handleDelete"
        >
          {{ busy === "delete" ? "Deleting..." : "Delete" }}
        </Button>
      </div>

      <div v-if="lookup" class="rounded-lg border border-dot-border bg-dot-bg p-3 text-sm">
        <p class="text-xs uppercase tracking-wider text-dot-text-secondary mb-1">
          {{ lookup.key }}
        </p>
        <p v-if="lookup.value === null" class="text-dot-text-tertiary italic">No value set.</p>
        <p v-else class="text-dot-text-primary font-mono break-all">{{ lookup.value }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import Button from "@/components/ui/Button.vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";

const wallet = useWalletStore();
const userStore = useUserStoreManager();
const toast = useToast();

const keyInput = ref("");
const valueInput = ref("");
const busy = ref<"set" | "get" | "delete" | null>(null);
const lookup = ref<{ key: string; value: string | null } | null>(null);

async function handleSet() {
  const key = keyInput.value.trim();
  if (!key) return;
  busy.value = "set";
  try {
    await userStore.setStringValue(key, valueInput.value);
    toast.success(`Saved "${key}"`);
    lookup.value = { key, value: valueInput.value || null };
  } catch (error) {
    console.warn("[StoreTab] Failed to save value:", error);
    toast.error("Failed to save value");
  } finally {
    busy.value = null;
  }
}

async function handleGet() {
  const key = keyInput.value.trim();
  if (!key) return;
  busy.value = "get";
  try {
    const value = await userStore.getStringValue(key);
    lookup.value = { key, value };
  } catch (error) {
    console.warn("[StoreTab] Failed to read value:", error);
    toast.error("Failed to read value");
  } finally {
    busy.value = null;
  }
}

async function handleDelete() {
  const key = keyInput.value.trim();
  if (!key) return;
  busy.value = "delete";
  try {
    await userStore.deleteStringValue(key);
    toast.success(`Deleted "${key}"`);
    lookup.value = { key, value: null };
  } catch (error) {
    console.warn("[StoreTab] Failed to delete value:", error);
    toast.error("Failed to delete value");
  } finally {
    busy.value = null;
  }
}
</script>
