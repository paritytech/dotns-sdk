<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsReverseResolver</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Reverse Resolver handles
        <span class="text-dot-text-primary font-medium">reverse resolution</span> &mdash; turning a
        blockchain address back into a .dot name. This lets dApps show human-readable names instead
        of long hex addresses.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x95D57363B491CF743970c640fe419541386ac8BF
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">nameOf(addr)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the primary .dot name for the given address. Returns an empty string if no reverse
          record has been set.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'addr',
              type: 'address',
              description: 'The address to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'name',
              type: 'string',
              description: 'The primary .dot name, or empty string if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setReverseName(addr, name)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets the primary .dot name for an address. Only callable by the address itself (self-set
          only).
        </p>
        <DocParamTable :params="setReverseParams" />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the address being set (only self-set is allowed).
        </DocCallout>
      </div>
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink
        to="/docs/protocol/reverse-resolution"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Reverse resolve an address &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="reverse-resolver.ts" />
    </div>

    <DocCallout variant="info" title="One name per address">
      Each address can only have one primary .dot name. Setting a new reverse name overwrites the
      previous one. This is the name that dApps and wallets will display for the address.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/resolver"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Resolver
      </RouterLink>
      <RouterLink
        to="/docs/contracts/content-resolver"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Content Resolver &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocParamTable from "@/components/docs/DocParamTable.vue";
import DocReturnsTable from "@/components/docs/DocReturnsTable.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import DocCallout from "@/components/docs/DocCallout.vue";
import DocBadge from "@/components/docs/DocBadge.vue";

const setReverseParams = [
  {
    name: "addr",
    type: "address",
    description: "The address to set the reverse record for",
    required: true,
  },
  {
    name: "name",
    type: "string",
    description: "The .dot name to associate with this address (e.g. alice.dot)",
    required: true,
  },
];

const exampleCode = `import { createPublicClient, createWalletClient, custom, defineChain, http } from "viem";

// ABI fragments for the functions used in this example
const reverseResolverAbi = [
  {
    type: "function",
    name: "nameOf",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setReverseName",
    inputs: [
      { name: "addr", type: "address" },
      { name: "name", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const paseoAssetHub = defineChain({
  id: 420420417,
  name: "Paseo AssetHub",
  nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
  },
});

const client = createPublicClient({
  chain: paseoAssetHub,
  transport: http(),
});

const REVERSE_RESOLVER = "0x95D57363B491CF743970c640fe419541386ac8BF";

// Reverse resolve: address -> name
const name = await client.readContract({
  address: REVERSE_RESOLVER,
  abi: reverseResolverAbi,
  functionName: "nameOf",
  args: ["0x1234...abcd"],
});
if (name) {
  console.log("Resolves to:", name);
}

// Set your primary .dot name (requires wallet client)
const walletClient = createWalletClient({
  chain: paseoAssetHub,
  transport: custom(window.ethereum),
});

await walletClient.writeContract({
  address: REVERSE_RESOLVER,
  abi: reverseResolverAbi,
  functionName: "setReverseName",
  args: [walletClient.account.address, "alice.dot"],
});`;
</script>
