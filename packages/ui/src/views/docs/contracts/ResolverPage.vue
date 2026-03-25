<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsResolver</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Resolver handles
        <span class="text-dot-text-primary font-medium">forward resolution</span> &mdash; turning a
        .dot name into a blockchain address. Wallets and dApps query this contract when they need to
        translate a human-readable name into an address.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">addressOf(node)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the address that the given node resolves to. Returns
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >address(0)</code
          >
          if no address has been set.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'node',
              type: 'bytes32',
              description: 'The namehash of the .dot name',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'addr',
              type: 'address',
              description: 'The resolved address, or zero address if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setAddress(node, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets the address that a node resolves to. Only callable by the node owner or an approved
          operator.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'node',
              type: 'bytes32',
              description: 'The namehash of the .dot name',
              required: true,
            },
            {
              name: 'value',
              type: 'address',
              description: 'The address this name should resolve to',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the node owner or an approved operator.
        </DocCallout>
      </div>
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/introduction" class="text-dot-accent hover:text-dot-accent-hover">
        Resolve a .dot name &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="resolver.ts" />
    </div>

    <DocCallout variant="info" title="No gas for reads">
      The <code>addressOf</code> function is a read-only call and does not cost gas. Any client can
      call it without a wallet connection. Only <code>setAddress</code> requires a signed
      transaction.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/controller"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Controller
      </RouterLink>
      <RouterLink
        to="/docs/contracts/reverse-resolver"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Reverse Resolver &rarr;
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

const exampleCode = `import { createPublicClient, createWalletClient, custom, defineChain, http, namehash } from "viem";

// ABI fragments for the functions used in this example
const resolverAbi = [
  {
    type: "function",
    name: "addressOf",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setAddress",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "value", type: "address" },
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

const RESOLVER = "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514";
const node = namehash("alice.dot");

// Forward resolve: name -> address
const address = await client.readContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: "addressOf",
  args: [node],
});
console.log("alice.dot resolves to:", address);

// Set address (requires wallet client)
const walletClient = createWalletClient({
  chain: paseoAssetHub,
  transport: custom(window.ethereum),
});

await walletClient.writeContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: "setAddress",
  args: [node, walletClient.account.address],
});`;
</script>
