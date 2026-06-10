<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsRegistry</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Registry is the <span class="text-dot-text-primary font-medium">source of truth</span>
        for all .dot names. It maps each node (a hashed name identifier) to its owner and resolver
        address, and is the only contract that stores ownership data.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0xa1b2b939E82b2ecE55Bd8a0E283818BfC1CA6CDc
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
        <p class="text-sm text-dot-text-secondary">Returns the owner of a node.</p>
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
        <p class="text-sm text-dot-text-secondary">Returns the resolver of a node.</p>
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
          Creates or reassigns a subnode and assigns its owner. Callable only by the current owner
          of the parent node. Subnodes are parent-sovereign: the parent owner may reassign a subnode
          or rotate its resolver at any time without the prior subnode owner's consent. On
          reassignment the resolver pointer is reset to the protocol default reverse resolver.
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
          The caller is not the current owner of the parent node (NotAuthorised), the new owner is
          the zero address (NotAllowed), the sublabel is not a canonical DNS label (InvalidLabel),
          or the parent label does not match the parent node (ParentLabelMismatch).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setOwner(node, owner)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Creates or resets a node record for a tokenised base registration. Restricted to the
          registrar's controllers, called on fresh registration and on every reclaim from escrow.
          The new owner must match the ERC-721 owner reported by the registrar; the record stores a
          zero-address sentinel so reads delegate to
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >IDotnsRegistrar.ownerOf</code
          >
          and ERC-721 transfers stay authoritative. Each call also rewrites the resolver to the
          protocol default reverse resolver so a prior owner's resolver cannot be inherited.
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
              description: 'The new owner address; must match the registrar ERC-721 owner',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller is not one of the registrar's controllers, or the new owner is zero or does not
          match the registrar's ERC-721 owner (NotAuthorised / NotAllowed).
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
          Sets or clears the resolver for a node. Callable only by the current node owner; for
          tokenised nodes authorisation falls back to the ERC-721 owner, an approved address, or an
          operator-for-all via the registrar. The registry does not validate the resolver address,
          so consumers must verify resolver shape before trusting reads.
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
              name: 'resolverAddr',
              type: 'address',
              description: 'Resolver contract address (zero clears)',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller is not the current node owner, nor an ERC-721 owner, approved address, or
          operator-for-all for a tokenised node (NotAuthorised).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            recordExists(node)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">Returns whether a node exists.</p>
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
              description: 'True if the node has been explicitly created',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            isAuthorised(node, account)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns whether an account is authorised to manage a node. For subnodes, authority is the
          explicit stored owner. For tokenised nodes it is the ERC-721 owner, an address approved
          for the token, or an operator approved for all of the owner's tokens via the registrar.
          This is the canonical authorisation check the registry enforces on owner-gated entry
          points. Returns false for a node that does not exist.
        </p>
        <DocParamTable
          :params="[
            { name: 'node', type: 'bytes32', description: 'Node identifier', required: true },
            {
              name: 'account',
              type: 'address',
              description: 'Address whose authority is being checked',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'authorisedFlag',
              type: 'bool',
              description: 'True when account may manage node',
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
      The Registry does not store addresses or content records directly. It only maps names to their
      owners and resolver contracts. All resolution data lives in the separate resolver contracts
      that the Registry points to.
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

const REGISTRY = "0xa1b2b939E82b2ecE55Bd8a0E283818BfC1CA6CDc";
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
