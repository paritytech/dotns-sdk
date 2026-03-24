<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Introduction</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Why DotNS</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS stores everything on chain. There are no servers to maintain and no indexers to run.
        Every piece of data &mdash; names, addresses, profiles, content hashes &mdash; can be read
        directly from a small set of known contracts.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Design Philosophy</h2>
      <div class="space-y-3">
        <div
          v-for="principle in principles"
          :key="principle.title"
          class="flex items-start gap-3 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <span
            class="mt-0.5 w-8 h-8 rounded-lg bg-dot-accent-soft text-dot-accent flex items-center justify-center text-sm shrink-0"
            >{{ principle.icon }}</span
          >
          <div>
            <p class="text-sm font-medium text-dot-text-primary">{{ principle.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ principle.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">DotNS vs ENS</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b border-dot-border">
              <th class="text-left py-2 pr-4 text-dot-text-tertiary font-medium">Feature</th>
              <th class="text-left py-2 pr-4 text-dot-text-tertiary font-medium">DotNS</th>
              <th class="text-left py-2 text-dot-text-tertiary font-medium">ENS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in comparison" :key="row.feature" class="border-b border-dot-border/50">
              <td class="py-2.5 pr-4 text-dot-text-secondary">{{ row.feature }}</td>
              <td class="py-2.5 pr-4 text-dot-text-primary">{{ row.dotns }}</td>
              <td class="py-2.5 text-dot-text-secondary">{{ row.ens }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Native to Polkadot</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        DotNS runs on Polkadot's EVM-compatible layer via Revive. Solidity smart contracts execute
        natively alongside Substrate pallets, with access to Polkadot's shared security. Names
        registered on DotNS are Polkadot-native, not bridged from another chain.
      </p>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/introduction"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; What is DotNS
      </RouterLink>
      <RouterLink to="/docs/getting-started" class="text-dot-accent hover:text-dot-accent-hover">
        Getting Started &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const principles = [
  {
    icon: "DB",
    title: "On-chain by default",
    description:
      "All data lives in contract storage and can be read directly. No event replay or external indexers needed.",
  },
  {
    icon: "Q",
    title: "Easy to find",
    description:
      "Every name, address, and record has a known location on chain. You never have to scan the entire blockchain to find it.",
  },
  {
    icon: "Im",
    title: "Permanent records",
    description:
      "Once a name is registered, its record is locked in the owner's Store contract. Nobody can alter or delete it.",
  },
  {
    icon: "Bx",
    title: "Predictable costs",
    description:
      "Lookups and writes use simple keys, so gas costs stay consistent regardless of how many names exist.",
  },
];

const comparison = [
  { feature: "Chain", dotns: "Polkadot (Revive EVM)", ens: "Ethereum L1" },
  { feature: "TLD", dotns: ".dot", ens: ".eth" },
  { feature: "Ownership", dotns: "Permanent (ERC721)", ens: "Rental (yearly renewal)" },
  {
    feature: "Sybil resistance",
    dotns: "Proof of Personhood tiers",
    ens: "Price-based (auction)",
  },
  {
    feature: "Registration",
    dotns: "Commit-reveal + PoP pricing",
    ens: "Commit-reveal + time auction",
  },
  {
    feature: "Web hosting",
    dotns: "Native (Bulletin + dweb-proxy)",
    ens: "Via third-party gateways",
  },
  {
    feature: "On-chain storage",
    dotns: "Per-user Store with immutable keys",
    ens: "Resolver records only",
  },
];
</script>
