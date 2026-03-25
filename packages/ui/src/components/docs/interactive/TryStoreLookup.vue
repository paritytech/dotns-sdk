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
              v-model="input"
              @keydown.enter="lookup"
              type="text"
              placeholder="0xD908...bb72 or 5DtFfW...TMLe or alice"
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
            <Button
              variant="primary"
              size="sm"
              :disabled="!input.trim()"
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
            <span class="text-sm text-dot-text-secondary">Looking up Store&hellip;</span>
          </div>

          <div v-else-if="status === 'error'" class="space-y-1">
            <p class="text-sm font-medium text-error">Lookup failed</p>
            <p class="text-xs text-error/80">{{ error }}</p>
          </div>

          <div v-else-if="status === 'no-store'" class="space-y-1">
            <p class="text-sm font-medium text-dot-text-secondary">No Store deployed</p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-primary font-mono">{{ resolvedAddress }}</span> does not
              have a Store contract yet.
            </p>
          </div>

          <div v-else-if="status === 'success'" class="space-y-4">
            <div class="space-y-1">
              <p class="text-xs text-dot-text-tertiary">Store contract</p>
              <p class="text-sm font-mono text-dot-accent break-all">{{ storeAddress }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-xs text-dot-text-tertiary">Owner (EVM)</p>
              <p class="text-sm font-mono text-dot-text-primary break-all">{{ resolvedAddress }}</p>
            </div>

            <div v-if="names.length > 0">
              <p class="text-xs text-dot-text-tertiary mb-2">Names ({{ names.length }})</p>
              <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="border-b border-dot-border">
                      <th class="text-left py-2 pr-4 text-dot-text-tertiary font-medium text-xs">
                        #
                      </th>
                      <th class="text-left py-2 text-dot-text-tertiary font-medium text-xs">
                        Name
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(name, i) in names" :key="i" class="border-b border-dot-border/50">
                      <td class="py-2 pr-4 text-xs text-dot-text-tertiary">{{ i + 1 }}</td>
                      <td class="py-2">
                        <span class="text-xs font-mono text-dot-text-primary">{{ name }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-else>
              <p class="text-xs text-dot-text-tertiary">No names found in Store.</p>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="codeExample" lang="typescript" filename="store-lookup.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { isAddress, zeroAddress, type Address } from "viem";
import { useResolverStore } from "@/store/useResolverStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import {
  normalizeNameInput,
  ensureNetworkReady,
  formatNetworkError,
} from "@/lib/docInteractiveHelpers";
import { isValidSubstrateAddress } from "@/utils";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const resolverStore = useResolverStore();
const walletStore = useWalletStore();
const userStoreManager = useUserStoreManager();

const input = ref("");
const loading = ref(false);
const error = ref("");
const status = ref<"idle" | "loading" | "success" | "no-store" | "error">("idle");
const storeAddress = ref("");
const resolvedAddress = ref("");
const names = ref<string[]>([]);

const panelClasses = computed(() => {
  if (status.value === "error") return "border-error/30 bg-error/5";
  return "border-dot-border bg-dot-surface";
});

const codeExample = computed(() => {
  const addr = resolvedAddress.value || "0x...";
  return `import { createPublicClient, http, zeroAddress } from 'viem'

const STORE_FACTORY = '0x030296782F4d3046B080BcB017f01837561D9702'

const client = createPublicClient({
  chain: { id: 420420417, name: 'Paseo AssetHub',
    nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
    rpcUrls: { default: { http: ['https://eth-rpc-testnet.polkadot.io'] } },
  },
  transport: http(),
})

// 1. Look up Store address
const store = await client.readContract({
  address: STORE_FACTORY,
  abi: [{ type: 'function', name: 'getDeployedStore',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view' }],
  functionName: 'getDeployedStore',
  args: ['${addr}'],
})

if (store === zeroAddress) {
  console.log('No Store deployed')
} else {
  // 2. Read all names from Store
  const values = await client.readContract({
    address: store,
    abi: [{ type: 'function', name: 'getValues',
      inputs: [], outputs: [{ name: '', type: 'string[]' }],
      stateMutability: 'view' }],
    functionName: 'getValues',
  })
  console.log('Names:', values.filter(v => v.endsWith('.dot')))
}`;
});

async function resolveToEvmAddress(value: string): Promise<Address> {
  if (isAddress(value)) return value as Address;

  if (isValidSubstrateAddress(value)) {
    return await walletStore.convertToEVM(value);
  }

  const label = normalizeNameInput(value);
  const resolved = await resolverStore.resolveNameToAddress(label);
  if (resolved && resolved !== zeroAddress) return resolved as Address;

  const owner = await resolverStore.getOwnerOfDomain(label);
  if (owner && owner !== zeroAddress) return owner as Address;

  throw new Error(`Could not resolve "${value}" to an address`);
}

async function lookup() {
  const value = input.value.trim();
  if (!value) return;

  loading.value = true;
  error.value = "";
  status.value = "loading";
  names.value = [];
  storeAddress.value = "";
  resolvedAddress.value = "";

  try {
    await ensureNetworkReady();

    const evmAddr = await resolveToEvmAddress(value);
    resolvedAddress.value = evmAddr;

    const store = await userStoreManager.getUserStore(evmAddr);
    if (store === zeroAddress) {
      status.value = "no-store";
      return;
    }

    storeAddress.value = store;

    const allValues = await userStoreManager.getSubdomainsForAddress(evmAddr);
    names.value = allValues.filter((v) => v.endsWith(".dot"));
    status.value = "success";
  } catch (e) {
    error.value = formatNetworkError(e);
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
