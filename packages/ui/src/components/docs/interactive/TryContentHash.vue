<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Enter a .dot domain to look up its content hash</label
          >
          <div class="flex gap-2">
            <input
              v-model="name"
              @keydown.enter="lookup"
              type="text"
              placeholder="mysite"
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
            <Button
              variant="primary"
              size="sm"
              :disabled="!name.trim()"
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
            <span class="text-sm text-dot-text-secondary"
              >Looking up content hash for {{ lastQueried }}.dot&hellip;</span
            >
          </div>
          <div v-else-if="status === 'error'" class="space-y-1">
            <p class="text-sm font-medium text-error">Lookup failed</p>
            <p class="text-xs text-error/80">{{ error }}</p>
          </div>
          <div v-else-if="status === 'empty'" class="space-y-1">
            <p class="text-sm font-medium text-dot-text-secondary">No content hash set</p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-primary font-mono">{{ lastQueried }}.dot</span> has no
              decentralised content hosted yet.
            </p>
          </div>
          <div v-else-if="status === 'success'" class="space-y-2">
            <p class="text-xs text-dot-text-tertiary">Content hash for {{ lastQueried }}.dot</p>
            <p class="text-sm font-mono text-dot-text-primary break-all">{{ contentHash }}</p>
            <p class="text-xs text-dot-text-tertiary">
              This domain has decentralised content hosted via IPFS.
            </p>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="content-hash.ts" />
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

const name = ref("");
const contentHash = ref<string | null>(null);
const error = ref("");
const loading = ref(false);
const lastQueried = ref("");
const status = ref<"idle" | "loading" | "success" | "empty" | "error">("idle");

const viemCode = computed(() => {
  const label = normalizeNameInput(name.value) || "mysite";
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
const node = namehash(\`\${name}.dot\`)

const contentHash = await client.readContract({
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
  args: [node, 'contenthash'],
})

console.log(\`Content hash for \${name}.dot:\`, contentHash || 'not set')`;
});

const panelClasses = computed(() => statusPanelClasses(status.value));

async function lookup() {
  const input = normalizeNameInput(name.value);
  if (!input) return;

  loading.value = true;
  error.value = "";
  contentHash.value = null;
  lastQueried.value = input;
  status.value = "loading";

  try {
    await ensureNetworkReady();

    const result = await resolver.getText(input, "contenthash");
    if (result) {
      contentHash.value = result;
      status.value = "success";
    } else {
      status.value = "empty";
    }
  } catch (e) {
    error.value = formatNetworkError(e);
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
