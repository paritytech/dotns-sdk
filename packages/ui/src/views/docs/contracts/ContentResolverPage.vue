<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsContentResolver</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Content Resolver stores
        <span class="text-dot-text-primary font-medium">text records</span> and
        <span class="text-dot-text-primary font-medium">IPFS content hashes</span> for .dot names.
        It supports arbitrary key-value text records (such as social handles) and CID-based content
        hashes for decentralised website hosting.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">text(node, key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the text record value for a given node and key. Returns an empty string if the
          record does not exist.
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
              name: 'key',
              type: 'string',
              description: 'The record key to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'value',
              type: 'string',
              description: 'The text record value, or empty string if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setText(node, key, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets a text record for the given node. Common keys include
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >com.twitter</code
          >,
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >com.github</code
          >,
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >url</code
          >, and
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >description</code
          >.
        </p>
        <DocParamTable :params="setTextParams" />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the node owner or an approved operator.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">contenthash(node)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the content hash for a given node. Returns empty bytes if no content hash has been
          set.
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
              name: 'hash',
              type: 'bytes',
              description: 'The content hash (e.g. IPFS CID), or empty bytes if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setContenthash(node, hash)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets the content hash for a node. Typically an IPFS CID that points to a decentralised
          website or application.
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
              name: 'hash',
              type: 'bytes',
              description: 'The content hash (e.g. IPFS CID encoded as bytes)',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not the node owner or an approved operator.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            isApprovedForAll(owner, operator)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns whether the operator is approved to manage all content records for the given
          owner.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'owner',
              type: 'address',
              description: 'The record owner address',
              required: true,
            },
            {
              name: 'operator',
              type: 'address',
              description: 'The operator address to check',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'approved',
              type: 'bool',
              description: 'True if the operator is approved for all records',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setApprovalForAll(operator, approved)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Grants or revokes permission for an operator to manage all of the caller's content
          records. Useful for delegating record management to a dApp or CI/CD pipeline.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'operator',
              type: 'address',
              description: 'The address to grant or revoke operator permissions',
              required: true,
            },
            {
              name: 'approved',
              type: 'bool',
              description: 'True to approve, false to revoke',
              required: true,
            },
          ]"
        />
      </div>
    </div>

    <TryItSection title="Try it — Read a text record">
      <TryGetText />
    </TryItSection>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="content-resolver.ts" />
    </div>

    <DocCallout variant="tip" title="Operator approvals for CI/CD">
      Use <code>setApprovalForAll</code> to authorise a deployment bot or CI/CD pipeline to update
      your content hash automatically on every push. This enables fully decentralised continuous
      deployment workflows.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/reverse-resolver"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Reverse Resolver
      </RouterLink>
      <RouterLink
        to="/docs/contracts/pop-rules"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        PoP Rules &rarr;
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
import TryItSection from "@/components/docs/TryItSection.vue";
import TryGetText from "@/components/docs/interactive/TryGetText.vue";

const setTextParams = [
  { name: "node", type: "bytes32", description: "The namehash of the .dot name", required: true },
  { name: "key", type: "string", description: "The record key (e.g. com.twitter)", required: true },
  { name: "value", type: "string", description: "The record value (e.g. @alice)", required: true },
];

const exampleCode = `import { createPublicClient, createWalletClient, custom, defineChain, http, namehash } from "viem";

// ABI fragments for the functions used in this example
const contentResolverAbi = [
  {
    type: "function",
    name: "text",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setText",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "contenthash",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setContenthash",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "hash", type: "bytes" },
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

const CONTENT_RESOLVER = "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7";
const node = namehash("alice.dot");

// Read text records
const twitter = await client.readContract({
  address: CONTENT_RESOLVER,
  abi: contentResolverAbi,
  functionName: "text",
  args: [node, "com.twitter"],
});
console.log("Twitter:", twitter);

// Set text records (requires wallet client)
const walletClient = createWalletClient({
  chain: paseoAssetHub,
  transport: custom(window.ethereum),
});

await walletClient.writeContract({
  address: CONTENT_RESOLVER,
  abi: contentResolverAbi,
  functionName: "setText",
  args: [node, "com.twitter", "@alice"],
});

// Set IPFS content hash
const cid = "0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f";
await walletClient.writeContract({
  address: CONTENT_RESOLVER,
  abi: contentResolverAbi,
  functionName: "setContenthash",
  args: [node, cid],
});

// Read content hash
const hash = await client.readContract({
  address: CONTENT_RESOLVER,
  abi: contentResolverAbi,
  functionName: "contenthash",
  args: [node],
});
console.log("Content hash:", hash);`;
</script>
