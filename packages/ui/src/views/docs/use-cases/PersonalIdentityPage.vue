<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Personal Identity</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Own your on-chain identity with a <span class="font-mono text-dot-accent">.dot</span>
        name. Instead of sharing a hex address, share a human-readable name that links to your
        wallet, your social profiles, and your decentralised website &mdash; all controlled by you,
        stored on Polkadot.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why On-chain Identity Matters</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Blockchain addresses are long, error-prone, and meaningless to humans. A .dot name gives you
        a memorable, verifiable identity that works across the Polkadot ecosystem. When someone sees
        <span class="font-mono text-dot-accent">alice.dot</span>, they know exactly who they are
        dealing with.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="benefit in benefits"
          :key="benefit.title"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ benefit.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ benefit.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Setting Up Your Identity</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Building your on-chain identity involves three steps: registering a name, setting text
        records for your profile, and enabling reverse resolution (address-to-name lookup) so
        applications display your name.
      </p>
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
              <RouterLink
                v-if="step.link"
                :to="step.link"
                class="text-xs text-dot-accent hover:text-dot-accent-hover mt-1 inline-block"
              >
                Learn more &rarr;
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Profile Text Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Text records are key-value pairs stored in the
        <span class="font-mono text-dot-accent">DotnsContentResolver</span> contract. They form your
        on-chain profile and are readable by any application or user.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Record</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Purpose</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="record in textRecords" :key="record.key" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ record.key }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-secondary text-xs">
                {{ record.example }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ record.purpose }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCodeBlock :code="setRecordsCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Reverse Resolution</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Reverse resolution maps your address back to your primary .dot name. When an application
        sees your address, it can look up your name and display
        <span class="font-mono text-dot-accent">alice.dot</span> instead of
        <span class="font-mono text-dot-text-tertiary">0x1234...abcd</span>.
      </p>
      <DocCodeBlock :code="reverseResolutionCode" lang="bash" filename="terminal" />
      <DocCallout variant="tip" title="One primary name per address">
        Each address can have only one primary name set for reverse resolution. If you own multiple
        .dot names, choose the one that best represents your identity.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Related Documentation</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RouterLink
          v-for="link in relatedLinks"
          :key="link.to"
          :to="link.to"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent transition-colors"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ link.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ link.description }}</p>
        </RouterLink>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink to="/docs/tools/ui" class="text-dot-text-tertiary hover:text-dot-text-primary">
        &larr; Web UI
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/dapp-hosting"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        dApp Hosting &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const benefits = [
  {
    title: "Human-Readable",
    description: "Share alice.dot instead of 0x1a2b...9f0e. Easy to remember, easy to verify.",
  },
  {
    title: "Self-Sovereign",
    description: "You own your name as an NFT. No centralised authority can take it away.",
  },
  {
    title: "Composable Profile",
    description:
      "Link social accounts, bio, and website to your name. Readable by any application on the network.",
  },
  {
    title: "Cross-Ecosystem",
    description: "Works with both EVM and Substrate addresses across the Polkadot network.",
  },
];

const setupSteps = [
  {
    title: "Register your .dot name",
    description:
      "Choose a unique name and register it through the commit-reveal process. Your name is an ERC-721 NFT that you own.",
    link: "/docs/protocol/registration",
  },
  {
    title: "Set your text records",
    description:
      "Add profile information: Twitter handle, GitHub username, website URL, and a short bio. These are stored in the ContentResolver.",
    link: "/docs/protocol/content",
  },
  {
    title: "Enable reverse resolution",
    description:
      "Set your primary name so that applications can display alice.dot instead of your hex address when they see your account.",
    link: "/docs/protocol/reverse-resolution",
  },
];

const textRecords = [
  { key: "twitter", example: "@alice_dot", purpose: "Your Twitter/X handle" },
  { key: "github", example: "alice", purpose: "Your GitHub username" },
  { key: "url", example: "https://alice.dot", purpose: "Your personal website" },
  { key: "description", example: "Builder on Polkadot", purpose: "A short bio or tagline" },
  { key: "avatar", example: "ipfs://bafybei...", purpose: "Profile picture (IPFS CID or URL)" },
  { key: "email", example: "alice@example.com", purpose: "Contact email address" },
];

const relatedLinks = [
  {
    to: "/docs/protocol/registration",
    title: "Registration",
    description: "Learn about the commit-reveal registration flow and pricing.",
  },
  {
    to: "/docs/protocol/content",
    title: "Content & Profiles",
    description: "How text records and content hashes work.",
  },
  {
    to: "/docs/protocol/reverse-resolution",
    title: "Reverse Resolution",
    description: "How address-to-name mapping works under the hood.",
  },
  {
    to: "/docs/tools/ui",
    title: "Web UI",
    description: "Browser-based interface for managing .dot names.",
  },
];

const setRecordsCode = `# View current content records for a name
dotns content view alice

# Set text records via the CLI
dotns text set alice twitter "@alice"
dotns text set alice github "alice"
dotns text set alice url "https://alice.dev"`;

const reverseResolutionCode = `# Enable reverse resolution during domain registration
dotns register domain --name alice -r

# If you already own the name, re-register with the -r flag
# to set the reverse record for your address.

# Verify your name resolves correctly
dotns lookup name alice
# Output: full name info including address, owner, and content`;
</script>
