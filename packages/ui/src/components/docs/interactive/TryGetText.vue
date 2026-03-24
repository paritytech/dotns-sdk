<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-dot-text-secondary mb-1.5">Domain name</label>
            <input
              v-model="domain"
              type="text"
              placeholder="alice"
              class="w-full bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
          </div>
          <div>
            <label class="block text-sm text-dot-text-secondary mb-1.5">Record key</label>
            <select
              v-model="key"
              class="w-full bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            >
              <option value="twitter">twitter</option>
              <option value="github">github</option>
              <option value="url">url</option>
              <option value="description">description</option>
              <option value="email">email</option>
            </select>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          :disabled="!domain.trim()"
          :loading="loading"
          @click="getText"
        >
          Read Record
        </Button>

        <div v-if="status !== 'idle'" class="p-4 rounded-lg border" :class="panelClasses">
          <div v-if="status === 'loading'" class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary"
              >Reading {{ lastKey }} for {{ lastDomain }}.dot&hellip;</span
            >
          </div>
          <div v-else-if="status === 'error'" class="space-y-1">
            <p class="text-sm font-medium text-error">Read failed</p>
            <p class="text-xs text-error/80">{{ error }}</p>
          </div>
          <div v-else-if="status === 'empty'" class="space-y-1">
            <p class="text-sm font-medium text-dot-text-secondary">No record set</p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="font-mono text-dot-accent">{{ lastKey }}</span> is not set for
              <span class="text-dot-text-primary">{{ lastDomain }}.dot</span>.
            </p>
          </div>
          <div v-else-if="status === 'success'" class="space-y-1">
            <p class="text-xs text-dot-text-tertiary">{{ lastKey }} for {{ lastDomain }}.dot</p>
            <p class="text-sm text-dot-text-primary break-all">{{ result }}</p>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="get-text.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useResolverStore } from "@/store/useResolverStore";
import {
  normalizeNameInput,
  ensureNetworkReady,
  formatNetworkError,
  statusPanelClasses,
} from "@/lib/docInteractiveHelpers";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const resolver = useResolverStore();

const domain = ref("");
const key = ref("twitter");
const result = ref<string | null>(null);
const error = ref("");
const loading = ref(false);
const lastDomain = ref("");
const lastKey = ref("");
const status = ref<"idle" | "loading" | "success" | "empty" | "error">("idle");

const viemCode = computed(() => {
  const label = normalizeNameInput(domain.value) || "alice";
  const recordKey = key.value || "twitter";
  return `import { createPublicClient, http, namehash } from 'viem'

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

const name = '${label}'
const key = '${recordKey}'
const node = namehash(\`\${name}.dot\`)

const value = await client.readContract({
  address: '0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7',
  abi: [{
    type: 'function',
    name: 'text',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  }],
  functionName: 'text',
  args: [node, key],
})

console.log(\`\${key} for \${name}.dot:\`, value || 'not set')`;
});

const panelClasses = computed(() => statusPanelClasses(status.value));

async function getText() {
  const input = normalizeNameInput(domain.value);
  if (!input) return;

  loading.value = true;
  error.value = "";
  lastDomain.value = input;
  lastKey.value = key.value;
  status.value = "loading";

  try {
    await ensureNetworkReady();

    result.value = await resolver.getText(input, key.value);
    status.value = result.value ? "success" : "empty";
  } catch (e) {
    error.value = formatNetworkError(e);
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
