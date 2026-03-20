<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Resolution</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Forward resolution maps a <span class="text-dot-text-primary font-medium">.dot name</span>
        to an on-chain address. This is the most common operation in the protocol &mdash; it lets
        wallets, dApps, and users send transactions to human-readable names instead of hex
        addresses.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How Forward Resolution Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">DotnsResolver</span> contract exposes a single
        read function: <span class="font-mono text-dot-text-primary">addressOf(node)</span>. Given a
        node hash, it returns the address that the name resolves to.
      </p>
      <DocCodeBlock :code="resolverCode" lang="solidity" filename="DotnsResolver.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Computing the Node from a Label</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        To resolve a name, you first need to compute its
        <span class="font-mono text-dot-text-primary">node</span>. This is a two-step hash: first
        hash the label, then hash it with the DOT_NODE root.
      </p>
      <DocCodeBlock :code="computeNodeCode" lang="solidity" filename="computing node" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Full Resolution Example</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Here is a complete example of resolving
        <span class="font-mono text-dot-accent">alice.dot</span>
        from a Solidity contract or off-chain using viem:
      </p>
      <DocCodeBlock :code="solidityExample" lang="solidity" filename="ResolveExample.sol" />
      <DocCodeBlock :code="viemExample" lang="typescript" filename="resolve.ts" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Resolution Flow</h2>
      <div class="space-y-3">
        <div
          v-for="(step, i) in flowSteps"
          :key="i"
          class="flex items-start gap-4 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div
            class="w-8 h-8 rounded-lg bg-dot-surface-secondary text-dot-text-primary flex items-center justify-center text-sm font-bold shrink-0"
          >
            {{ i + 1 }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ step.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <DocCallout variant="info" title="No gas required">
      Forward resolution is a read-only call (<span class="font-mono">view</span> function). It does
      not cost gas and can be executed off-chain by any client.
    </DocCallout>

    <TryItSection title="Try it — Resolve a .dot name">
      <TryResolveName />
    </TryItSection>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Edge Cases</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Scenario</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Result</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Name not registered</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">address(0)</td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Name registered, no address set</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">address(0)</td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Name registered with address</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">
                The mapped address
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/registration"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Registration
      </RouterLink>
      <RouterLink
        to="/docs/protocol/reverse-resolution"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Reverse Resolution &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryResolveName from "@/components/docs/interactive/TryResolveName.vue";

const resolverCode = `// DotnsResolver — Forward resolution
function addressOf(bytes32 node) external view returns (address) {
    // Returns the address mapped to this node, or address(0) if not set
}`;

const computeNodeCode = `// Step 1: Hash the label
bytes32 labelhash = keccak256(abi.encodePacked("alice"));

// Step 2: Hash with DOT_NODE to get the full node
bytes32 DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce;
bytes32 node = keccak256(abi.encodePacked(DOT_NODE, labelhash));

// Step 3: Query the resolver
address resolved = resolver.addressOf(node);`;

const solidityExample = `contract NameResolver {
    IDotnsResolver public resolver;
    bytes32 constant DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce;

    function resolve(string calldata label) external view returns (address) {
        bytes32 labelhash = keccak256(abi.encodePacked(label));
        bytes32 node = keccak256(abi.encodePacked(DOT_NODE, labelhash));
        return resolver.addressOf(node);
    }
}`;

const viemExample = `import { createPublicClient, defineChain, http, namehash } from "viem";

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

// Resolve "alice.dot"
const node = namehash("alice.dot");
const address = await client.readContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: "addressOf",
  args: [node],
});`;

const flowSteps = [
  {
    title: "Compute the labelhash",
    description: "Hash the label string with keccak256 to get the labelhash.",
  },
  {
    title: "Compute the node",
    description: "Hash DOT_NODE concatenated with labelhash using keccak256 to get the full node.",
  },
  {
    title: "Call addressOf(node)",
    description:
      "Query the DotnsResolver contract with the computed node. Returns address(0) if not found.",
  },
];
</script>
