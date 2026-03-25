<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Enter an EVM address, Substrate address, or .dot name</label
          >
          <div class="flex gap-2">
            <input
              v-model="address"
              @keydown.enter="lookup"
              type="text"
              placeholder="0xD908...bb72 or 5DtFfW...TMLe or alice"
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
import { isAddress, zeroAddress, type Address } from "viem";
import { useResolverStore } from "@/store/useResolverStore";
import { useWalletStore } from "@/store/useWalletStore";
import {
  normalizeNameInput,
  ensureNetworkReady,
  formatNetworkError,
  statusPanelClasses,
} from "@/lib/docInteractiveHelpers";
import { isValidSubstrateAddress } from "@/utils";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const resolver = useResolverStore();
const walletStore = useWalletStore();

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

const panelClasses = computed(() => statusPanelClasses(status.value));

async function resolveToEvmAddress(value: string): Promise<Address> {
  if (isAddress(value)) return value as Address;

  if (isValidSubstrateAddress(value)) {
    return await walletStore.convertToEVM(value);
  }

  const label = normalizeNameInput(value);
  const resolved = await resolver.resolveNameToAddress(label);
  if (resolved && resolved !== zeroAddress) return resolved as Address;

  const owner = await resolver.getOwnerOfDomain(label);
  if (owner && owner !== zeroAddress) return owner as Address;

  throw new Error(`Could not resolve "${value}" to an address`);
}

async function lookup() {
  const input = address.value.trim();
  if (!input) return;

  if (!isAddress(input) && !isValidSubstrateAddress(input) && !input.endsWith(".dot")) {
    error.value = "Enter a valid EVM address, Substrate address, or .dot name";
    status.value = "error";
    return;
  }

  loading.value = true;
  error.value = "";
  result.value = null;
  status.value = "loading";

  try {
    await ensureNetworkReady();

    const evmAddr = await resolveToEvmAddress(input);
    const name = await resolver.resolveAddressToName(evmAddr);
    if (name) {
      result.value = name;
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
