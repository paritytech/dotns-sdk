<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsRegistry</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Registry is the <span class="text-dot-text-primary font-medium">source of truth</span>
        for all .dot names. It maps each node to its owner and resolver address, and is the only
        contract that stores ownership data.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">owner(node)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the owner address for the given node. Returns
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >address(0)</code
          >
          if the node does not exist.
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
              name: 'owner',
              type: 'address',
              description: 'Owner address, or zero address if unregistered',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">resolver(node)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the resolver address set for the given node.
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
              name: 'resolver',
              type: 'address',
              description: 'Resolver contract address, or zero address if none set',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setSubnodeOwner(record)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Creates or updates a subnode record. Only callable by the parent node owner or an
          authorised operator.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'record',
              type: 'SubnodeRecord',
              description:
                'Struct with parentNode (bytes32), subLabel (string), parentLabel (string), owner (address). See Type Definitions.',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'subnode', type: 'bytes32', description: 'The namehash of the new subnode' },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the owner of the parent node.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setOwner(node, newOwner, resolver)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Transfers ownership of a node to a new address and optionally updates the resolver.
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
              name: 'newOwner',
              type: 'address',
              description: 'The new owner address',
              required: true,
            },
            {
              name: 'resolver',
              type: 'address',
              description: 'The resolver address to set',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the current owner of the node.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setResolver(node, resolver)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Updates the resolver address for a node. Only callable by the node owner.
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
              name: 'resolver',
              type: 'address',
              description: 'The new resolver contract address',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the current owner of the node.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            recordExists(node)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >true</code
          >
          if a record exists for the given node (i.e., the owner is not the zero address).
        </p>
        <DocParamTable
          :params="[
            { name: 'node', type: 'bytes32', description: 'The namehash to check', required: true },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'exists',
              type: 'bool',
              description: 'True if the node has a registered owner',
            },
          ]"
        />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="registry.ts" />
    </div>

    <DocCallout variant="info" title="Central source of truth">
      The Registry does not store addresses or content records directly. It only maps nodes to their
      owners and resolver contracts. All resolution data lives in the resolver contracts pointed to
      by the Registry.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/overview"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Overview
      </RouterLink>
      <RouterLink
        to="/docs/contracts/registrar"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Registrar &rarr;
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

const exampleCode = `import { createPublicClient, defineChain, http, namehash } from "viem";

// ABI fragments for the functions used in this example
const registryAbi = [
  {
    type: "function",
    name: "recordExists",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
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

const REGISTRY = "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f";
const node = namehash("alice.dot");

// Check if a node exists and get its owner
const exists = await client.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "recordExists",
  args: [node],
});

if (exists) {
  const owner = await client.readContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "owner",
    args: [node],
  });
  console.log("Owner:", owner);
}`;
</script>
