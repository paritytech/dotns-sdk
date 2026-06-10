<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsContentResolver</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Content Resolver stores
        <span class="text-dot-text-primary font-medium">text records</span> and
        <span class="text-dot-text-primary font-medium">IPFS content hashes</span> for .dot names.
        It supports key-value text records (such as social media handles) and IPFS content hashes
        (CIDs) for decentralised website hosting.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x8A26480b0B5Df3d4D9b95adc24a5Ecb33A5b8F64
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
        <p class="text-sm text-dot-text-secondary">Returns a text record for a node.</p>
        <DocParamTable
          :params="[
            {
              name: 'node',
              type: 'bytes32',
              description: 'The node to query',
              required: true,
            },
            {
              name: 'key',
              type: 'string',
              description: 'Text record key',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'value',
              type: 'string',
              description: 'Stored text value, or empty string if unset',
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
          Sets a text record for a node. The caller must own the node in the DotNS registry or be an
          approved operator. Text records are arbitrary key/value strings, for example
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >avatar</code
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
          The caller does not own the node in the registry and is not an approved operator.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">contenthash(node)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the content hash associated with a node.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'node',
              type: 'bytes32',
              description: 'The node to query',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'hash',
              type: 'bytes',
              description: 'The stored content hash bytes, or empty if unset',
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
          Sets the content hash for a node. The caller must own the node in the DotNS registry or be
          an approved operator. Content hashes are opaque bytes, for example an IPFS CID; the
          resolver stores them as-is and never interprets the payload.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'node',
              type: 'bytes32',
              description: 'The node whose content hash is being set',
              required: true,
            },
            {
              name: 'hash',
              type: 'bytes',
              description: 'Opaque content hash bytes',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller does not own the node in the registry and is not an approved operator.
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
          Query if an address is an approved operator for another address.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'owner',
              type: 'address',
              description: 'The owner of the nodes',
              required: true,
            },
            {
              name: 'operator',
              type: 'address',
              description: 'The address acting on behalf of the owner',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'approved',
              type: 'bool',
              description: 'True if operator is approved, false otherwise',
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
          Enable or disable approval for a third party ("operator") to manage all of
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >msg.sender</code
          >'s nodes.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'operator',
              type: 'address',
              description: 'Address to authorise or revoke',
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

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/protocol/content" class="text-dot-accent hover:text-dot-accent-hover">
        Read a text record &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="content-resolver.ts" />
    </div>

    <DocCallout variant="tip" title="Operator approvals for CI/CD">
      Use <code>setApprovalForAll</code> to authorise a deployment bot or automated pipeline to
      update your content hash on every push. This enables fully decentralised continuous deployment
      workflows.
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

const setTextParams = [
  {
    name: "node",
    type: "bytes32",
    description: "The node whose text record is being set",
    required: true,
  },
  {
    name: "key",
    type: "string",
    description: 'Text record key (e.g. "ipfs", "avatar")',
    required: true,
  },
  { name: "value", type: "string", description: "Text record value", required: true },
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

const CONTENT_RESOLVER = "0x8A26480b0B5Df3d4D9b95adc24a5Ecb33A5b8F64";
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
