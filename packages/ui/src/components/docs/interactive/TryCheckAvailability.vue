<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Check if a name is available</label
          >
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                v-model="name"
                @keydown.enter="check"
                type="text"
                placeholder="myname"
                class="w-full bg-dot-surface border border-dot-border rounded-lg px-3 py-2 pr-12 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-dot-text-tertiary"
                >.dot</span
              >
            </div>
            <Button
              variant="primary"
              size="sm"
              :disabled="!name.trim()"
              :loading="loading"
              @click="check"
            >
              Check
            </Button>
          </div>
        </div>

        <div
          v-if="status === 'loading'"
          class="p-4 rounded-lg border border-dot-border bg-dot-surface"
        >
          <div class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary"
              >Checking {{ lastQueried }}.dot&hellip;</span
            >
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
          class="p-4 rounded-lg border"
          :class="available ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'"
        >
          <div class="flex items-center gap-2 mb-2">
            <span class="w-2 h-2 rounded-full" :class="available ? 'bg-success' : 'bg-warning'" />
            <span class="text-sm font-medium" :class="available ? 'text-success' : 'text-warning'">
              {{ lastQueried }}.dot is {{ available ? "available" : "taken" }}
            </span>
          </div>
          <div v-if="!available && ownerAddress" class="space-y-1 mb-2">
            <p class="text-xs text-dot-text-tertiary">Owner</p>
            <p class="text-xs font-mono text-dot-text-secondary break-all">{{ ownerAddress }}</p>
          </div>
          <div v-if="available && price" class="space-y-1 text-sm text-dot-text-secondary">
            <p>
              Price: <span class="text-dot-text-primary font-mono">{{ formattedPrice }} PAS</span>
            </p>
            <p>
              Requires: <span class="text-dot-text-primary">{{ tierLabel(price.status) }}</span>
            </p>
          </div>
          <p v-if="available && !price" class="text-xs text-dot-text-tertiary">
            Connect your wallet to see PoP-adjusted pricing.
          </p>
        </div>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="viemCode" lang="typescript" filename="check-availability.ts" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useResolverStore } from "@/store/useResolverStore";
import { useDomainStore } from "@/store/useDomainStore";
import { useWalletStore } from "@/store/useWalletStore";
import { zeroAddress, formatEther } from "viem";
import {
  normalizeNameInput,
  ensureNetworkReady,
  formatNetworkError,
  tierLabel,
} from "@/lib/docInteractiveHelpers";
import Button from "@/components/ui/Button.vue";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const resolver = useResolverStore();
const domain = useDomainStore();
const walletStore = useWalletStore();

const name = ref("");
const available = ref(false);
const ownerAddress = ref<string | null>(null);
const price = ref<{ price: bigint; status: number; userStatus: number; message: string } | null>(
  null,
);
const error = ref("");
const loading = ref(false);
const lastQueried = ref("");
const formattedPrice = ref("");
const status = ref<"idle" | "loading" | "result" | "error">("idle");

const viemCode = computed(() => {
  const label = normalizeNameInput(name.value) || "alice";
  return `import { createPublicClient, http, keccak256, toHex } from 'viem'

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

const label = '${label}'
const tokenId = BigInt(keccak256(toHex(label)))

try {
  const owner = await client.readContract({
    address: '0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD',
    abi: [{
      type: 'function',
      name: 'ownerOf',
      inputs: [{ name: 'tokenId', type: 'uint256' }],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view',
    }],
    functionName: 'ownerOf',
    args: [tokenId],
  })
  console.log(\`\${label}.dot is taken, owner:\`, owner)
} catch {
  console.log(\`\${label}.dot is available!\`)
}`;
});

async function check() {
  const input = normalizeNameInput(name.value);
  if (!input) return;

  loading.value = true;
  error.value = "";
  price.value = null;
  ownerAddress.value = null;
  lastQueried.value = input;
  status.value = "loading";

  try {
    await ensureNetworkReady();

    // Use the same pattern as the app's checkHandleAvailability():
    // query both Resolver (address) and Registrar (owner) — no wallet needed.
    const [resolvedAddress, nameOwner] = await Promise.all([
      resolver.resolveNameToAddress(input),
      resolver.getOwnerOfDomain(input),
    ]);

    const owner = resolvedAddress ?? nameOwner ?? zeroAddress;
    available.value = owner === zeroAddress;
    ownerAddress.value = owner !== zeroAddress ? owner : null;

    // If available and wallet is connected, fetch pricing
    if (available.value && walletStore.isConnected) {
      try {
        const priceInfo = await domain.priceWithoutCheck(input);
        price.value = priceInfo;
        formattedPrice.value = formatEther(priceInfo.price);
      } catch {
        // Pricing fetch failed — show availability without price
      }
    }

    status.value = "result";
  } catch (e) {
    error.value = formatNetworkError(e);
    status.value = "error";
  } finally {
    loading.value = false;
  }
}
</script>
