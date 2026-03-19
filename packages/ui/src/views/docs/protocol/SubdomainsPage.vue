<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Subdomains</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Subdomains extend the .dot namespace hierarchically. The owner of
        <span class="font-mono text-dot-accent">alice.dot</span> can create
        <span class="font-mono text-dot-accent">blog.alice.dot</span>,
        <span class="font-mono text-dot-accent">gov.alice.dot</span>, or any other child name under
        their parent node.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How Subdomains Work</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A subdomain is created by calling
        <span class="font-mono text-dot-accent">setSubnodeOwner</span> on the
        <span class="font-mono text-dot-text-primary">DotnsRegistry</span>. This sets the owner of
        the child node in the registry, enabling full resolution and record management for the
        subdomain.
      </p>
      <DocCodeBlock :code="setSubnodeCode" lang="solidity" filename="DotnsRegistry.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Parent Ownership Required</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Only the owner of the parent node can create subdomains. Namespace authority flows top-down
        &mdash; you must own
        <span class="font-mono text-dot-accent">alice.dot</span> to create any
        <span class="font-mono text-dot-accent">*.alice.dot</span> subdomain.
      </p>
      <DocCallout variant="info" title="Ownership check">
        The Registry verifies <span class="font-mono">msg.sender == owner(parentNode)</span> before
        allowing subdomain creation. Approved operators of the parent node can also create
        subdomains.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Subnode Hash Calculation</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The subnode hash follows the same namehash pattern used for top-level names. The child label
        is hashed with the parent node:
      </p>
      <DocCodeBlock :code="subnodeHashCode" lang="solidity" filename="subnode calculation" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Example: blog.alice.dot</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p>
            <span class="text-dot-text-tertiary">aliceNode</span> = keccak256(DOT_NODE,
            keccak256("alice"))
          </p>
          <p>
            <span class="text-dot-text-tertiary">subnode</span> = keccak256(aliceNode,
            keccak256("blog"))
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Recursive Hierarchy</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Subdomains can themselves have subdomains. The owner of
        <span class="font-mono text-dot-accent">blog.alice.dot</span> can create
        <span class="font-mono text-dot-accent">drafts.blog.alice.dot</span>, and so on. Each level
        follows the same
        <span class="font-mono text-dot-text-primary">keccak256(parentNode, keccak256(label))</span>
        pattern.
      </p>
      <DocCodeBlock :code="recursiveCode" lang="solidity" filename="recursive subdomains" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Store Integration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When a subdomain is created, the name is written to the owner's
        <span class="font-mono text-dot-accent">Store</span>. This provides an on-chain record of
        all names associated with an address, enabling efficient enumeration and lookup.
      </p>
      <DocCallout variant="tip" title="Subdomain use cases">
        Subdomains are ideal for organisations (team.company.dot), project namespacing
        (app.project.dot), and multi-tenant hosting (user.platform.dot). Each subdomain can have its
        own resolver records, text records, and content hash.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Creating a Subdomain</h2>
      <div class="space-y-3">
        <div
          v-for="(step, i) in createSteps"
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

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Subnode Creation Sequence</h2>
      <p class="text-dot-text-secondary text-sm leading-relaxed">
        The full on-chain flow when creating a subdomain. The Registry verifies ownership, then
        coordinates with the Controller, StoreFactory, and Store to set up the new subnode.
      </p>
      <DocDiagramImage
        src="/diagrams/subname.png"
        alt="Subnode creation sequence diagram showing interactions between User, DotnsRegistry, DotnsRegistrarController, StoreFactory, and Store"
        caption="Subnode Creation Sequence"
      />
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/proof-of-personhood"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Proof of Personhood
      </RouterLink>
      <RouterLink to="/docs/protocol/store" class="text-dot-accent hover:text-dot-accent-hover">
        On-Chain Storage &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import DocDiagramImage from "@/components/docs/DocDiagramImage.vue";

const setSubnodeCode = `// Create a subdomain in the Registry
function setSubnodeOwner(
    bytes32 parentNode,
    bytes32 labelhash,
    address owner
) external;

// Example: Create "blog.alice.dot"
bytes32 aliceNode = ...; // node hash of alice.dot
bytes32 blogHash = keccak256(abi.encodePacked("blog"));
registry.setSubnodeOwner(aliceNode, blogHash, newOwner);`;

const subnodeHashCode = `// The subnode follows the standard namehash pattern:
bytes32 subnode = keccak256(abi.encodePacked(parentNode, keccak256(abi.encodePacked("sub"))));

// For blog.alice.dot:
bytes32 DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce;
bytes32 aliceNode = keccak256(abi.encodePacked(DOT_NODE, keccak256(abi.encodePacked("alice"))));
bytes32 blogNode  = keccak256(abi.encodePacked(aliceNode, keccak256(abi.encodePacked("blog"))));`;

const recursiveCode = `// Subdomains can have subdomains (unlimited depth)

// Level 1: alice.dot
bytes32 aliceNode = keccak256(abi.encodePacked(DOT_NODE, keccak256("alice")));

// Level 2: blog.alice.dot
bytes32 blogNode = keccak256(abi.encodePacked(aliceNode, keccak256("blog")));

// Level 3: drafts.blog.alice.dot
bytes32 draftsNode = keccak256(abi.encodePacked(blogNode, keccak256("drafts")));`;

const createSteps = [
  {
    title: "Verify parent ownership",
    description:
      "Check that you own the parent name (e.g. alice.dot) or are an approved operator for it.",
  },
  {
    title: "Compute the labelhash",
    description:
      'Hash the subdomain label with keccak256 (e.g. keccak256("blog") for blog.alice.dot).',
  },
  {
    title: "Call setSubnodeOwner",
    description:
      "Call registry.setSubnodeOwner(parentNode, labelhash, owner) to create the subdomain and assign ownership.",
  },
  {
    title: "Configure records",
    description:
      "The subdomain owner can now set resolver records, text records, and content hashes for the new subdomain.",
  },
];
</script>
