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
        <span class="font-mono text-dot-text-primary">DotnsRegistry</span>. This records the owner
        of the child name in the registry, which enables resolution and record management for the
        subdomain.
      </p>
      <DocCodeBlock :code="setSubnodeCode" lang="solidity" filename="DotnsRegistry.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Parent Ownership Required</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Only the owner of the parent name can create subdomains. Authority flows from parent to
        child &mdash; you must own
        <span class="font-mono text-dot-accent">alice.dot</span> to create any
        <span class="font-mono text-dot-accent">*.alice.dot</span> subdomain.
      </p>
      <DocCallout variant="info" title="Ownership check">
        The Registry checks that the caller is authorised over the parent node &mdash; the current
        ERC-721 holder, a single-token approvee, or an operator-for-all on the registrar &mdash;
        before allowing subdomain creation. A registrar-level approval therefore delegates subdomain
        creation too.
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Records and Resolution</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A subnode carries its own
        <span class="font-mono text-dot-accent">(owner, resolver)</span> entry in the Registry, so
        once created it resolves and accepts records exactly like a top-level name. The subdomain
        owner can set a forward address, text records, and a content hash against the subnode.
      </p>
      <DocCallout variant="tip" title="Subdomain use cases">
        Subdomains are ideal for organisations (team.company.dot), project namespaces
        (app.project.dot), and multi-user hosting (user.platform.dot). Each subdomain can have its
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
        When creating a subdomain, the Registry checks ownership of the parent node, then records
        the child node's owner and resolver.
      </p>
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

const setSubnodeCode = `// Create a subdomain in the Registry — takes a single struct
struct SubnodeRecord {
    bytes32 parentNode;   // node hash of the parent (e.g. alice.dot)
    string  subLabel;     // the child label (e.g. "blog")
    string  parentLabel;  // the parent label (e.g. "alice")
    address owner;        // who will own the subdomain
}

function setSubnodeOwner(SubnodeRecord calldata record) external;

// Example: Create "blog.alice.dot"
registry.setSubnodeOwner(SubnodeRecord({
    parentNode: aliceNode,
    subLabel: "blog",
    parentLabel: "alice",
    owner: newOwner
}));`;

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
    title: "Assemble the subnode parameters",
    description:
      'Build the struct with the parent node, the child label (e.g. "blog"), the parent label (e.g. "alice"), and the new owner.',
  },
  {
    title: "Call setSubnodeOwner",
    description:
      "Call registry.setSubnodeOwner(params) with the struct to create the subdomain and assign ownership.",
  },
  {
    title: "Configure records",
    description:
      "The subdomain owner can now set resolver records, text records, and content hashes for the new subdomain.",
  },
];
</script>
