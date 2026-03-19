<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">The .dot Namespace</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Every <span class="text-dot-text-primary font-medium">.dot</span> name is derived from a
        deterministic hashing scheme. Understanding labels, nodes, and namehashes is the foundation
        for working with DotNS at the contract level.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Labels</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A label is the human-readable part of a
        <span class="font-mono text-dot-accent">.dot</span> name. For example, in
        <span class="font-mono text-dot-accent">alice.dot</span>, the label is
        <span class="font-mono text-dot-text-primary">"alice"</span>. Labels are normalized to
        lowercase and must contain only alphanumeric characters.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The DOT_NODE Root</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        All <span class="font-mono text-dot-accent">.dot</span> names share a common root hash
        called <span class="font-mono text-dot-text-primary">DOT_NODE</span>. This is the namehash
        of the top-level <span class="font-mono text-dot-accent">.dot</span> namespace and serves as
        the parent for all registered names.
      </p>
      <DocCodeBlock :code="dotNodeCode" lang="text" filename="DOT_NODE" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Namehash Calculation</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        To compute the <span class="font-mono text-dot-text-primary">node</span> for a label, you
        hash the label itself, then hash it together with the parent node. This produces a unique
        <span class="font-mono text-dot-text-primary">bytes32</span> identifier for every name in
        the hierarchy.
      </p>
      <DocCodeBlock :code="namehashCode" lang="solidity" filename="namehash.sol" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Example: alice.dot</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p><span class="text-dot-text-tertiary">labelhash</span> = keccak256("alice")</p>
          <p><span class="text-dot-text-tertiary">node</span> = keccak256(DOT_NODE, labelhash)</p>
          <p><span class="text-dot-text-tertiary">tokenId</span> = uint256(node)</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Labelhash</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-text-primary">labelhash</span> is simply
        <span class="font-mono text-dot-accent">keccak256(label)</span>. It is used both for
        computing the full node and as an input to the registration functions. The ERC721
        <span class="font-mono text-dot-text-primary">tokenId</span> is the
        <span class="font-mono text-dot-text-primary">uint256</span> cast of the node.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Token ID</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Each registered .dot name is an ERC721 NFT. The token ID is derived directly from the node:
      </p>
      <DocCodeBlock :code="tokenIdCode" lang="solidity" filename="tokenId.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Subname Hierarchy</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Subnames extend the hierarchy by hashing a child label with the parent node. For example,
        <span class="font-mono text-dot-accent">blog.alice.dot</span> is computed by hashing
        <span class="font-mono text-dot-text-primary">"blog"</span> with the node of
        <span class="font-mono text-dot-accent">alice.dot</span>.
      </p>
      <DocCodeBlock :code="subnameCode" lang="solidity" filename="subname.sol" />
    </div>

    <DocCallout variant="tip" title="Deterministic addressing">
      Because node hashes are computed purely from the label hierarchy, anyone can independently
      derive the node for any .dot name without querying the chain. This makes off-chain indexing
      and verification straightforward.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Quick Reference</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Term</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Definition</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="row in referenceTable" :key="row.term" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-text-primary text-xs">{{ row.term }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ row.definition }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/architecture"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Architecture
      </RouterLink>
      <RouterLink
        to="/docs/protocol/registration"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Registration &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const dotNodeCode = `DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce`;

const namehashCode = `// Labelhash: hash the label string
bytes32 labelhash = keccak256(abi.encodePacked("alice"));

// Node: hash the parent node with the labelhash
bytes32 node = keccak256(abi.encodePacked(DOT_NODE, labelhash));

// This node uniquely identifies "alice.dot" across the protocol`;

const tokenIdCode = `// The ERC721 token ID is the uint256 cast of the node
uint256 tokenId = uint256(node);

// This means you can look up the NFT owner for any .dot name
// by computing its node hash off-chain`;

const subnameCode = `// Parent: alice.dot
bytes32 aliceNode = keccak256(abi.encodePacked(DOT_NODE, keccak256("alice")));

// Subname: blog.alice.dot
bytes32 subnode = keccak256(abi.encodePacked(aliceNode, keccak256("blog")));

// The hierarchy is recursive — sub.blog.alice.dot works the same way`;

const referenceTable = [
  { term: "label", definition: 'The human-readable part of a name (e.g. "alice")' },
  { term: "labelhash", definition: "keccak256(label) — the hash of a single label" },
  { term: "DOT_NODE", definition: "The root hash for the .dot namespace" },
  { term: "node", definition: "keccak256(parentNode, labelhash) — unique identifier for a name" },
  { term: "tokenId", definition: "uint256(node) — the ERC721 token ID for a .dot name" },
  {
    term: "subnode",
    definition: "keccak256(parentNode, keccak256(childLabel)) — hierarchical child",
  },
];
</script>
