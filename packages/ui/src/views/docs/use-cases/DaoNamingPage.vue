<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DAO Naming</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Register a base domain for your DAO like
        <span class="font-mono text-dot-accent">mydao.dot</span>, then create subnames for members
        (<span class="font-mono text-dot-accent">alice.mydao.dot</span>) and services (<span
          class="font-mono text-dot-accent"
          >gov.mydao.dot</span
        >). Organise your entire organisation under a single, memorable namespace with delegated
        ownership.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">DAO Namespace Structure</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A .dot domain creates a hierarchical namespace for your DAO. The base domain represents the
        organisation, and subnames represent members, services, and projects.
      </p>
      <DocCodeBlock :code="namespaceStructure" lang="text" filename="example namespace" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Setting Up a DAO Namespace</h2>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in setupSteps"
          :key="i"
          class="p-5 bg-dot-surface border-b border-dot-border last:border-b-0"
        >
          <div class="flex items-start gap-4">
            <span
              class="mt-0.5 w-7 h-7 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
              >{{ i + 1 }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-dot-text-primary font-medium">{{ step.title }}</p>
              <p class="text-sm text-dot-text-secondary mt-1">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Register the Base Domain</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Start by registering your DAO's base domain. This is the root name that all subnames will
        live under. It should be memorable and clearly identify your organisation.
      </p>
      <DocCodeBlock :code="registerCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Member Subnames</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Create subnames for DAO members. Each member gets a unique identity under the DAO's
        namespace that resolves to their wallet address.
      </p>
      <DocCodeBlock :code="memberCode" lang="bash" filename="terminal" />
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Subname</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Purpose</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Resolves To</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="member in memberExamples" :key="member.subname" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ member.subname }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ member.purpose }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-tertiary text-xs">
                {{ member.address }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Service Subnames</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Create subnames for DAO services, projects, and infrastructure. Each can have its own
        content hash for hosting a dedicated frontend.
      </p>
      <DocCodeBlock :code="serviceCode" lang="bash" filename="terminal" />
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Subname</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Purpose</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="service in serviceExamples" :key="service.subname" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ service.subname }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ service.purpose }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Ownership Delegation</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The owner of the base domain controls all subnames. You can delegate management by approving
        operators (addresses allowed to act on your behalf). This is useful for letting DAO
        multisigs, governance contracts, or trusted members manage subnames independently.
      </p>
      <DocCodeBlock :code="delegationCode" lang="bash" filename="terminal" />
      <DocCallout variant="warning" title="Operator permissions">
        Approved operators can create subnames, set records, and update content hashes for the
        parent domain. Only approve addresses you trust. Consider using a multisig for the base
        domain's ownership.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Governance Integration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        By owning the base domain with a multisig or governance contract, your DAO can manage its
        namespace through on-chain governance proposals. Members vote on subname creation,
        delegation changes, and content updates.
      </p>
      <DocCallout variant="tip" title="Multisig ownership">
        Register the base domain to a multisig wallet. That way no single member can unilaterally
        modify the DAO's namespace. Subname creation and delegation require multisig approval.
      </DocCallout>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/ci-cd-previews"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; CI/CD Previews
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/portfolio-site"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Portfolio Site &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const setupSteps = [
  {
    title: "Register the base domain",
    description:
      "Register mydao.dot through the commit-reveal registration flow. This is the root of your namespace.",
  },
  {
    title: "Create member subnames",
    description:
      "Assign subnames like alice.mydao.dot and bob.mydao.dot to DAO members, resolving to their addresses.",
  },
  {
    title: "Create service subnames",
    description:
      "Set up subnames for services: gov.mydao.dot for governance, app.mydao.dot for your dApp, docs.mydao.dot for documentation.",
  },
  {
    title: "Delegate ownership",
    description:
      "Approve operators (multisigs, governance contracts) to manage subnames without requiring the base domain owner's key.",
  },
];

const memberExamples = [
  { subname: "alice.mydao.dot", purpose: "Core contributor", address: "0x1a2b...3c4d" },
  { subname: "bob.mydao.dot", purpose: "Treasury manager", address: "0x5e6f...7a8b" },
  { subname: "carol.mydao.dot", purpose: "Developer", address: "0x9c0d...1e2f" },
];

const serviceExamples = [
  { subname: "gov.mydao.dot", purpose: "Governance voting interface" },
  { subname: "app.mydao.dot", purpose: "Main dApp frontend" },
  { subname: "docs.mydao.dot", purpose: "Documentation site" },
  { subname: "treasury.mydao.dot", purpose: "Treasury dashboard" },
  { subname: "forum.mydao.dot", purpose: "Community forum" },
];

const namespaceStructure = `mydao.dot                    ← Base domain (DAO identity)
├── alice.mydao.dot          ← Member: core contributor
├── bob.mydao.dot            ← Member: treasury manager
├── carol.mydao.dot          ← Member: developer
├── gov.mydao.dot            ← Service: governance UI
├── app.mydao.dot            ← Service: main dApp
├── docs.mydao.dot           ← Service: documentation
├── treasury.mydao.dot       ← Service: treasury dashboard
└── forum.mydao.dot          ← Service: community forum`;

const registerCode = `# Register the base domain for your DAO
dotns register domain --name mydao

# View the registration details
dotns lookup name mydao

# Set profile text records via the CLI
dotns text set mydao description "A community DAO on Polkadot"
dotns text set mydao url "https://mydao.example.com"`;

const memberCode = `# Create subnames for DAO members (with owner set via -o flag)
dotns register subname --name alice --parent mydao -o 0x1a2b...3c4d
dotns register subname --name bob --parent mydao -o 0x5e6f...7a8b
dotns register subname --name carol --parent mydao -o 0x9c0d...1e2f

# Verify a member subname
dotns lookup name alice.mydao`;

const serviceCode = `# Create service subnames
dotns register subname --name gov --parent mydao
dotns register subname --name app --parent mydao
dotns register subname --name docs --parent mydao

# Host a governance UI on gov.mydao.dot
dotns bulletin upload ./gov-ui/dist
dotns content set gov.mydao bafybei...

# Host the main dApp on app.mydao.dot
dotns bulletin upload ./app/dist
dotns content set app.mydao bafybei...`;

const delegationCode = `# Transfer the base domain to a multisig address
dotns register domain --name mydao --transfer --to 0xMultisigAddress

# The multisig now owns mydao.dot and can create/manage subnames.
# Operator approval is managed through the DotNS Registry contract.
# Use the CLI or interact with the Registry contract directly to approve operators.

# Verify the current owner
dotns lookup owner-of mydao`;
</script>
