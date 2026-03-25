<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Guides</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Create Subdomains</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Subdomains let you organise names hierarchically under your .dot domain. Create
        <code class="text-dot-accent">blog.alice.dot</code>,
        <code class="text-dot-accent">app.alice.dot</code>, or delegate
        <code class="text-dot-accent">team.dao.dot</code> to another address entirely.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How Subdomains Work</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every .dot name is an entry (called a node) in a tree structure. The root is
        <code class="text-dot-accent">DOT_NODE</code>, your domain
        <code class="text-dot-accent">alice.dot</code> is one level down, and
        <code class="text-dot-accent">blog.alice.dot</code> is two levels down. The
        <RouterLink
          to="/docs/contracts/registry"
          class="text-dot-accent hover:text-dot-accent-hover"
          >Registry</RouterLink
        >
        contract tracks who owns each node.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        Creating a subdomain means calling
        <span class="font-mono text-dot-accent">setSubnodeOwner</span> on the
        <RouterLink
          to="/docs/contracts/registry"
          class="text-dot-accent hover:text-dot-accent-hover"
          >Registry</RouterLink
        >. The parent node owner (you) sets the owner of the child node. That is the only
        requirement &mdash; you must own the parent.
      </p>
      <DocCodeBlock :code="subnodeHashCode" lang="solidity" filename="Node calculation" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Create a Subdomain</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Creating a subdomain calls
        <span class="font-mono text-dot-accent">setSubnodeOwner</span> on the
        <RouterLink
          to="/docs/contracts/registry"
          class="text-dot-accent hover:text-dot-accent-hover"
          >Registry</RouterLink
        >
        contract with the parent node, subdomain label hash, and the new owner address. This is a
        single transaction. You can use the CLI, SDK, or the DotNS web interface.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Create via CLI</h2>
      <DocCodeBlock :code="cliCode" lang="bash" filename="Terminal" />
      <p class="text-dot-text-secondary leading-relaxed">
        The <code class="text-dot-accent">--owner</code> flag sets who controls the subname. If
        omitted, it defaults to the caller (you).
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Create Programmatically</h2>
      <DocCodeBlock :code="programmaticCode" lang="typescript" filename="Create subdomain" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Delegation</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Subdomains become powerful through delegation. You can set a different owner for each
        subname. That owner gets full control: they can set the resolver (the contract that returns
        data for the name), create further subnames under it, and configure text records and content
        hashes.
      </p>
      <DocCodeBlock :code="delegationCode" lang="bash" filename="Terminal" />
      <DocCallout variant="info" title="Revocation">
        As the parent owner, you can always reclaim a subdomain by calling
        <code>setSubnodeOwner</code> again with a different address (or your own). The parent
        retains ultimate authority over the subtree.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Common Patterns</h2>
      <div class="space-y-3">
        <div
          v-for="pattern in patterns"
          :key="pattern.name"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div class="flex items-center gap-2 mb-2">
            <code class="text-dot-accent text-sm">{{ pattern.name }}</code>
          </div>
          <p class="text-xs text-dot-text-secondary">{{ pattern.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Hosting Content on Subdomains</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Each subdomain can have its own content hash, independent of the parent. Set the content
        hash the same way as on a regular domain:
      </p>
      <DocCodeBlock :code="subdomainContent" lang="bash" filename="Terminal" />
      <p class="text-dot-text-secondary leading-relaxed">
        The dweb gateway resolves subdomains the same way it resolves base domains. Visit
        <code class="text-dot-accent">blog.alice.paseo.li</code> and it serves whatever content hash
        is set on that subname's node.
      </p>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/guides/deploy-with-ci"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Deploy with CI
      </RouterLink>
      <RouterLink to="/docs/introduction" class="text-dot-accent hover:text-dot-accent-hover">
        Back to Introduction &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const subnodeHashCode = `// The node for blog.alice.dot:
bytes32 aliceNode = keccak256(abi.encodePacked(DOT_NODE, keccak256("alice")));
bytes32 blogNode  = keccak256(abi.encodePacked(aliceNode, keccak256("blog")));

// In the Registry:
registry.setSubnodeOwner(aliceNode, keccak256("blog"), newOwner);`;

const cliCode = `# Create a subdomain owned by yourself
dotns register subname --name blog --parent alice

# Create a subdomain owned by someone else
dotns register subname --name team --parent mydao --owner 0x1234...`;

const programmaticCode = `import { encodeFunctionData, namehash, keccak256, toBytes } from "viem";

const parentNode = namehash("alice.dot");
const label = keccak256(toBytes("blog"));
const newOwner = "0x1234...";

const data = encodeFunctionData({
  abi: registryAbi,
  functionName: "setSubnodeOwner",
  args: [parentNode, label, newOwner],
});

await walletClient.sendTransaction({
  to: REGISTRY_ADDRESS,
  data,
});`;

const delegationCode = `# Give bob control over dev.alice.dot
dotns register subname --name dev --parent alice --owner 0xBobAddress

# Bob can now set records, content hashes, and create further subnames
# under dev.alice.dot independently`;

const patterns = [
  {
    name: "blog.alice.dot",
    description: "Personal blog hosted on Bulletin/IPFS. Set the content hash to your blog's CID.",
  },
  {
    name: "app.myproject.dot",
    description: "Production deployment of a web app. Updated automatically by CI on each merge.",
  },
  {
    name: "pr42.myproject.dot",
    description:
      "Preview deployment for pull request #42. Created by the CI workflow, cleaned up on merge.",
  },
  {
    name: "alice.dao.dot",
    description:
      "Member subdomain. The DAO delegates alice.dao.dot to Alice's address, giving her full control.",
  },
  {
    name: "gov.dao.dot",
    description: "Governance interface. Points to the DAO's on-chain governance dashboard.",
  },
];

const subdomainContent = `# Set content hash on a subdomain
dotns content set blog.alice bafybeif7ztnhq...

# Verify
dotns content view blog.alice`;
</script>
