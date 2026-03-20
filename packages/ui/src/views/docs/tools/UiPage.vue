<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Tools</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Web UI</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The DotNS Web UI is a browser-based interface for interacting with the DotNS protocol.
        Search for domains, register names, manage your profile, and look up any .dot name &mdash;
        all from a clean, wallet-connected interface at
        <a
          href="https://dotns.paseo.li"
          target="_blank"
          rel="noopener"
          class="text-dot-accent hover:text-dot-accent-hover"
          >dotns.paseo.li</a
        >.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Features</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="p-5 border border-dot-border rounded-xl bg-dot-surface space-y-2"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ feature.title }}</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">{{ feature.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Domain Search &amp; Registration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The home page provides a search bar where you can check if a .dot name is available. If the
        name is unregistered, the UI walks you through the commit-reveal registration flow &mdash;
        including price estimation, Proof of Personhood verification (for premium names), and
        transaction signing.
      </p>
      <div class="border border-dot-border rounded-xl p-6 bg-dot-surface space-y-3">
        <div v-for="(step, i) in registrationSteps" :key="i" class="flex items-start gap-3">
          <span
            class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >{{ i + 1 }}</span
          >
          <p class="text-sm text-dot-text-secondary">{{ step }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Profile Management</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Once you own a .dot name, the profile page lets you manage your on-chain identity. Set text
        records for your social accounts, bio, and website. Set your primary name for reverse
        resolution so dApps can display your .dot name instead of your hex address.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Action</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="action in profileActions" :key="action.name" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium text-sm">{{ action.name }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ action.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Domain Lookup / Whois</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Look up any .dot name to see its owner, resolver address, text records, content hash, and
        registration details. The whois page provides a complete view of any domain's on-chain data
        &mdash; no wallet connection required.
      </p>
      <DocCallout variant="info" title="Public data">
        All .dot name data is on-chain and publicly readable. The whois lookup does not require
        authentication. Anyone can inspect any domain's records.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Reverse Resolution Lookup</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Enter any Polkadot address (EVM or SS58 format) to see if it has a primary .dot name set.
        This is useful for verifying identities and understanding which name an address has chosen
        to represent itself with.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Connecting Your Wallet</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        To register names and manage your profile, connect a wallet using the button in the top
        right corner. The UI supports any EVM-compatible wallet through the standard wallet
        connection flow.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in walletSteps"
          :key="i"
          class="p-4 bg-dot-surface border-b border-dot-border last:border-b-0"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
              >{{ i + 1 }}</span
            >
            <p class="text-sm text-dot-text-secondary">{{ step }}</p>
          </div>
        </div>
      </div>
      <DocCallout variant="tip" title="Read-only mode">
        You can browse the UI, search names, and view whois data without connecting a wallet. A
        wallet is only needed for transactions like registration, profile updates, and content hash
        changes.
      </DocCallout>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink to="/docs/tools/cli" class="text-dot-text-tertiary hover:text-dot-text-primary">
        &larr; CLI
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/personal-identity"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Personal Identity &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";

const features = [
  {
    title: "Domain Search & Registration",
    description:
      "Search for available .dot names and register them through a guided commit-reveal flow with price estimation and PoP verification.",
  },
  {
    title: "Profile Management",
    description:
      "Set text records (Twitter, GitHub, website, bio), manage content hashes, and configure your primary name for reverse resolution.",
  },
  {
    title: "Domain Lookup / Whois",
    description:
      "Look up any .dot name to see its owner, resolver, text records, content hash, and full registration details.",
  },
  {
    title: "Reverse Resolution Lookup",
    description:
      "Enter any address (EVM or SS58) to find its primary .dot name. Useful for verifying on-chain identities.",
  },
];

const registrationSteps = [
  "Search for a .dot name to check availability",
  "Review the price and Proof of Personhood requirements",
  "Submit the commit transaction (hashes your intent to register)",
  "Wait for the commitment period (prevents front-running)",
  "Submit the reveal transaction to complete registration",
  "Your .dot name is now yours — set up your profile",
];

const profileActions = [
  {
    name: "Edit text records",
    description: "Set or update key-value records like twitter, github, url, and description.",
  },
  {
    name: "Set primary name",
    description: "Choose which .dot name represents your address for reverse resolution.",
  },
  {
    name: "Set content hash",
    description:
      "Link your domain to an IPFS CID or Bulletin content hash for decentralised hosting.",
  },
  {
    name: "Manage subnames",
    description: "Create and configure subnames like blog.yourname.dot or app.yourname.dot.",
  },
  {
    name: "Approve operators",
    description: "Grant third-party addresses permission to update your records on your behalf.",
  },
];

const walletSteps = [
  "Click the 'Connect Wallet' button in the top right corner of the page.",
  "Select your preferred EVM-compatible wallet (MetaMask, Talisman, SubWallet, etc.).",
  "Approve the connection request in your wallet.",
  "Check that you are connected to the correct network (Paseo testnet or Polkadot mainnet).",
  "Your address and any owned .dot names will appear in the UI.",
];
</script>
