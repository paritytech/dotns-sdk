<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Type a name to see its classification</label
          >
          <div class="flex gap-2">
            <input
              v-model="name"
              @input="classify"
              type="text"
              placeholder="alice"
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
          </div>
        </div>

        <div
          v-if="status === 'no-wallet'"
          class="p-4 rounded-lg border border-warning/30 bg-warning/5 space-y-2"
        >
          <p class="text-sm font-medium text-warning">Wallet required</p>
          <p class="text-xs text-dot-text-tertiary">
            Connect your wallet to query name classification from the PopRules contract.
          </p>
          <Button variant="wallet" size="sm" @click="connectWallet">Connect Wallet</Button>
        </div>

        <div
          v-else-if="status === 'loading'"
          class="p-4 rounded-lg border border-dot-border bg-dot-surface"
        >
          <div class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary">Classifying&hellip;</span>
          </div>
        </div>

        <div
          v-else-if="status === 'error'"
          class="p-4 rounded-lg border border-error/30 bg-error/5 space-y-1"
        >
          <p class="text-sm font-medium text-error">Classification failed</p>
          <p class="text-xs text-error/80">{{ error }}</p>
        </div>

        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div
            v-if="status === 'result' && result"
            class="p-4 rounded-lg border border-dot-border bg-dot-surface space-y-3"
          >
            <div class="flex items-center gap-3">
              <span
                class="px-3 py-1 rounded-full text-xs font-bold"
                :class="tierClasses(result.requirement)"
              >
                {{ tierLabel(result.requirement) }}
              </span>
              <span class="text-sm text-dot-text-primary font-medium">{{ lastQueried }}.dot</span>
            </div>
            <p class="text-sm text-dot-text-secondary">{{ result.message }}</p>
            <div class="flex gap-4 text-xs text-dot-text-tertiary">
              <span
                >Length:
                <span class="text-dot-text-primary">{{ lastQueried.length }} chars</span></span
              >
              <span
                >Trailing digits:
                <span class="text-dot-text-primary">{{ trailingDigits(lastQueried) }}</span></span
              >
            </div>
          </div>
        </Transition>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="classify-name.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useDomainStore } from "@/store/useDomainStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useAbiStore } from "@/store/useAbiStore";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const domain = useDomainStore();
const walletStore = useWalletStore();
const networkStore = useNetworkStore();
const abiStore = useAbiStore();

const name = ref("");
const result = ref<{ requirement: number; message: string } | null>(null);
const error = ref("");
const lastQueried = ref("");
const status = ref<"idle" | "no-wallet" | "loading" | "result" | "error">("idle");

const viemCode = computed(() => {
  const label =
    name.value
      .trim()
      .replace(/\.dot$/, "")
      .toLowerCase() || "alice";
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

const name = '${label}'

const result = await client.readContract({
  address: '0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3',
  abi: [{
    type: 'function',
    name: 'classifyName',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  }],
  functionName: 'classifyName',
  args: [name],
})

const tiers = ['No Requirement', 'PoP Lite', 'PoP Full', 'Reserved']
console.log(\`\${name}.dot requires:\`, tiers[result] ?? 'Unknown')`;
});

let debounceTimer: ReturnType<typeof setTimeout>;

async function connectWallet() {
  try {
    await walletStore.connectWallet();
    status.value = "idle";
    if (name.value.trim()) classify();
  } catch {
    // User cancelled or extension not found
  }
}

function classify() {
  clearTimeout(debounceTimer);
  const input = name.value
    .trim()
    .replace(/\.dot$/, "")
    .toLowerCase();
  if (!input) {
    result.value = null;
    status.value = "idle";
    return;
  }

  debounceTimer = setTimeout(async () => {
    lastQueried.value = input;

    try {
      await networkStore.getClient();
      await abiStore.ensureAbis();
    } catch {
      error.value = "Network client not ready. Please wait for the app to finish loading.";
      status.value = "error";
      return;
    }

    if (!walletStore.isConnected) {
      status.value = "no-wallet";
      return;
    }

    status.value = "loading";
    error.value = "";

    try {
      result.value = await domain.classifyName(input);
      status.value = "result";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("Wallet not connected")) {
        status.value = "no-wallet";
      } else {
        error.value = msg;
        status.value = "error";
      }
    }
  }, 300);
}

function tierLabel(s: number): string {
  switch (s) {
    case 0:
      return "No Requirement";
    case 1:
      return "PoP Lite";
    case 2:
      return "PoP Full";
    case 3:
      return "Reserved";
    default:
      return "Unknown";
  }
}

function tierClasses(s: number): string {
  switch (s) {
    case 0:
      return "bg-success/10 text-success";
    case 1:
      return "bg-dot-accent-soft text-dot-accent";
    case 2:
      return "bg-warning/10 text-warning";
    case 3:
      return "bg-error/10 text-error";
    default:
      return "bg-dot-surface-secondary text-dot-text-secondary";
  }
}

function trailingDigits(s: string): number {
  const match = s.match(/\d+$/);
  return match ? match[0].length : 0;
}
</script>
