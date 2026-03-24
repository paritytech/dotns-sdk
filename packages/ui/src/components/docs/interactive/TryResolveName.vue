<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5">Enter a .dot name</label>
          <div class="flex gap-2">
            <input
              v-model="name"
              @keydown.enter="resolve"
              type="text"
              placeholder="alice"
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
            <Button
              variant="primary"
              size="sm"
              :disabled="!name.trim()"
              :loading="loading"
              @click="resolve"
            >
              Resolve
            </Button>
          </div>
        </div>

        <div v-if="status !== 'idle'" class="p-4 rounded-lg border" :class="panelClasses">
          <div v-if="status === 'loading'" class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary"
              >Resolving {{ lastQueried }}.dot&hellip;</span
            >
          </div>
          <div v-else-if="status === 'error'" class="space-y-1">
            <p class="text-sm font-medium text-error">Resolution failed</p>
            <p class="text-xs text-error/80">{{ error }}</p>
          </div>
          <div v-else-if="status === 'not-registered'" class="space-y-1">
            <p class="text-sm font-medium text-dot-text-secondary">Not registered</p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-primary font-mono">{{ lastQueried }}.dot</span> is
              available for registration.
            </p>
          </div>
          <div v-else-if="status === 'no-address'" class="space-y-2">
            <p class="text-sm font-medium text-warning">Registered &mdash; no address set</p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-primary font-mono">{{ lastQueried }}.dot</span> is owned
              but the owner has not set a resolver address yet.
            </p>
            <div v-if="owner" class="space-y-1">
              <p class="text-xs text-dot-text-tertiary">Owner</p>
              <p class="text-xs font-mono text-dot-text-secondary break-all">{{ owner }}</p>
            </div>
          </div>
          <div v-else-if="status === 'success'" class="space-y-1">
            <p class="text-xs text-dot-text-tertiary">Resolved address</p>
            <p class="text-sm font-mono text-dot-text-primary break-all">{{ result }}</p>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="resolve-name.ts" />
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
const result = ref<string | null>(null);
const owner = ref<string | null>(null);
const error = ref("");
const loading = ref(false);
const lastQueried = ref("");
const status = ref<"idle" | "loading" | "success" | "no-address" | "not-registered" | "error">(
  "idle",
);

const viemCode = computed(() => {
  const label = normalizeNameInput(name.value) || "alice";
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

const address = await client.readContract({
  address: '0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514',
  abi: [{
    type: 'function',
    name: 'addressOf',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  }],
  functionName: 'addressOf',
  args: [node],
})

console.log(\`\${name}.dot resolves to:\`, address)`;
});

const panelClasses = computed(() => statusPanelClasses(status.value));

async function resolve() {
  const input = normalizeNameInput(name.value);
  if (!input) return;

  loading.value = true;
  error.value = "";
  result.value = null;
  owner.value = null;
  lastQueried.value = input;
  status.value = "loading";

  try {
    await ensureNetworkReady();

    // Query both the Resolver (address) and Registrar (owner) — same
    // approach as the Whois lookup page's checkHandleAvailability().
    const [address, domainOwner] = await Promise.all([
      resolver.resolveNameToAddress(input),
      resolver.getOwnerOfDomain(input),
    ]);

    if (address) {
      result.value = address;
      status.value = "success";
    } else if (domainOwner) {
      owner.value = domainOwner;
      status.value = "no-address";
    } else {
      status.value = "not-registered";
    }
  } catch (e) {
    error.value = formatNetworkError(e);
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
