<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Enter an EVM address to check PoP level</label
          >
          <div class="flex gap-2">
            <input
              v-model="address"
              @keydown.enter="check"
              type="text"
              placeholder="0x..."
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary font-mono placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
            <Button
              variant="primary"
              size="sm"
              :disabled="!address.trim()"
              :loading="loading"
              @click="check"
            >
              Check
            </Button>
          </div>
        </div>

        <div
          v-if="status === 'no-wallet'"
          class="p-4 rounded-lg border border-warning/30 bg-warning/5 space-y-2"
        >
          <p class="text-sm font-medium text-warning">Wallet required</p>
          <p class="text-xs text-dot-text-tertiary">
            Connect your wallet to query PoP status from the PopRules contract.
          </p>
          <Button variant="wallet" size="sm" @click="connectWallet">Connect Wallet</Button>
        </div>

        <div
          v-else-if="status === 'loading'"
          class="p-4 rounded-lg border border-dot-border bg-dot-surface"
        >
          <div class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary">Checking PoP status&hellip;</span>
          </div>
        </div>

        <div
          v-else-if="status === 'error'"
          class="p-4 rounded-lg border border-error/30 bg-error/5 space-y-1"
        >
          <p class="text-sm font-medium text-error">Check failed</p>
          <p class="text-xs text-error/80">{{ error }}</p>
        </div>

        <div
          v-else-if="status === 'result'"
          class="p-4 rounded-lg border border-dot-border bg-dot-surface"
        >
          <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded-full text-xs font-bold" :class="tierClasses(result)">
              {{ tierLabel(result) }}
            </span>
            <span class="text-sm text-dot-text-secondary">
              {{ tierDescription(result) }}
            </span>
          </div>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="pop-status.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useDomainStore } from "@/store/useDomainStore";
import { useWalletStore } from "@/store/useWalletStore";
import { ensureNetworkReady } from "@/lib/docInteractiveHelpers";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";
import type { Address } from "viem";

const domain = useDomainStore();
const walletStore = useWalletStore();

const address = ref("");
const result = ref(0);
const error = ref("");
const loading = ref(false);
const status = ref<"idle" | "no-wallet" | "loading" | "result" | "error">("idle");

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

const userAddress = '${addr}'

const status = await client.readContract({
  address: '0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3',
  abi: [{
    type: 'function',
    name: 'userPopStatus',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  }],
  functionName: 'userPopStatus',
  args: [userAddress],
})

const tiers = ['No Status', 'PoP Lite', 'PoP Full', 'Reserved']
console.log('PoP status:', tiers[status] ?? 'Unknown')`;
});

async function connectWallet() {
  try {
    await walletStore.connectWallet();
    status.value = "idle";
  } catch {
    // User cancelled or extension not found
  }
}

async function check() {
  const input = address.value.trim();
  if (!input) return;

  if (!input.startsWith("0x") || input.length !== 42) {
    error.value = "Enter a valid EVM address (0x followed by 40 hex characters).";
    status.value = "error";
    return;
  }

  try {
    await ensureNetworkReady();
  } catch {
    error.value = "Network client not ready. Please wait for the app to finish loading.";
    status.value = "error";
    return;
  }

  if (!walletStore.isConnected) {
    status.value = "no-wallet";
    return;
  }

  loading.value = true;
  error.value = "";
  status.value = "loading";

  try {
    result.value = await domain.userPopStatus(input as Address);
    status.value = "result";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("Wallet not connected")) {
      status.value = "no-wallet";
    } else {
      error.value = msg;
      status.value = "error";
    }
  } finally {
    loading.value = false;
  }
}

function tierLabel(s: number): string {
  switch (s) {
    case 0:
      return "No Status";
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
      return "bg-dot-surface-secondary text-dot-text-secondary";
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

function tierDescription(s: number): string {
  switch (s) {
    case 0:
      return "This address has not completed any Proof of Personhood verification.";
    case 1:
      return "This address has completed PoP Lite verification.";
    case 2:
      return "This address has completed full PoP verification.";
    case 3:
      return "This address has Reserved status.";
    default:
      return "";
  }
}
</script>
