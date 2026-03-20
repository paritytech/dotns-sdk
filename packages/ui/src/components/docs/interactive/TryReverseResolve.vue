<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5">Enter an EVM address</label>
          <div class="flex gap-2">
            <input
              v-model="address"
              @keydown.enter="lookup"
              type="text"
              placeholder="0x..."
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary font-mono placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
            <Button
              variant="primary"
              size="sm"
              :disabled="!address.trim()"
              :loading="loading"
              @click="lookup"
            >
              Lookup
            </Button>
          </div>
        </div>

        <div v-if="status !== 'idle'" class="p-4 rounded-lg border" :class="panelClasses">
          <div v-if="status === 'loading'" class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary">Looking up address&hellip;</span>
          </div>
          <div v-else-if="status === 'error'" class="space-y-1">
            <p class="text-sm font-medium text-error">Lookup failed</p>
            <p class="text-xs text-error/80">{{ error }}</p>
          </div>
          <div v-else-if="status === 'empty'" class="space-y-1">
            <p class="text-sm font-medium text-dot-text-secondary">No primary name set</p>
            <p class="text-xs text-dot-text-tertiary">
              This address has no reverse record. The owner needs to call
              <span class="font-mono text-dot-accent">setPrimaryName</span> to set one.
            </p>
          </div>
          <div v-else-if="status === 'success'" class="space-y-1">
            <p class="text-xs text-dot-text-tertiary">Primary name</p>
            <p class="text-sm font-medium text-dot-accent">{{ result }}.dot</p>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="reverse-resolve.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useResolverStore } from "@/store/useResolverStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useAbiStore } from "@/store/useAbiStore";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";
import type { Address } from "viem";

const resolver = useResolverStore();
const networkStore = useNetworkStore();
const abiStore = useAbiStore();

const address = ref("");
const result = ref<string | null>(null);
const error = ref("");
const loading = ref(false);
const status = ref<"idle" | "loading" | "success" | "empty" | "error">("idle");

const viemCode = computed(() => {
  const addr = address.value.trim() || "0x...";
  return `import { createPublicClient, http } from 'viem'

const paseoAssetHub = {
  id: 420420417,
  name: 'Polkadot Hub Testnet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://eth-rpc-testnet.polkadot.io'] },
  },
} as const

const client = createPublicClient({
  chain: paseoAssetHub,
  transport: http(),
})

const evmAddress = '${addr}'

const name = await client.readContract({
  address: '0x95D57363B491CF743970c640fe419541386ac8BF',
  abi: [{
    type: 'function',
    name: 'nameOf',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  }],
  functionName: 'nameOf',
  args: [evmAddress],
})

console.log('Primary name:', name ? \`\${name}.dot\` : 'not set')`;
});

const panelClasses = computed(() => {
  switch (status.value) {
    case "error":
      return "border-error/30 bg-error/5";
    case "empty":
      return "border-warning/30 bg-warning/5";
    default:
      return "border-dot-border bg-dot-surface";
  }
});

async function lookup() {
  const input = address.value.trim();
  if (!input) return;

  if (!input.startsWith("0x") || input.length !== 42) {
    error.value = "Enter a valid EVM address (0x followed by 40 hex characters).";
    status.value = "error";
    return;
  }

  loading.value = true;
  error.value = "";
  result.value = null;
  status.value = "loading";

  try {
    await networkStore.getClient();
    await abiStore.ensureAbis();

    const name = await resolver.resolveAddressToName(input as Address);
    if (name) {
      result.value = name;
      status.value = "success";
    } else {
      status.value = "empty";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Client not initialized") || msg.includes("No valid network")) {
      error.value = "Network client not ready. Please wait for the app to finish loading.";
    } else {
      error.value = msg;
    }
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
