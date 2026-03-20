<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Introduction</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">What is DotNS</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS is a decentralised naming protocol for human-readable
        <span class="text-dot-text-primary font-medium">.dot</span> names on
        <span class="text-dot-text-primary font-medium">Polkadot</span>. It maps names to addresses,
        stores on-chain profiles, and enables decentralised web hosting.
      </p>
    </div>

    <div class="border border-dot-border rounded-xl p-6 bg-dot-surface space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What can you do with a .dot name?</h2>
      <ul class="space-y-3 text-dot-text-secondary">
        <li class="flex items-start gap-3">
          <span
            class="mt-1 w-5 h-5 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >1</span
          >
          <span
            ><span class="text-dot-text-primary font-medium">Resolve names to addresses</span>
            &mdash; Send tokens to <code class="text-dot-accent">alice.dot</code> instead of a hex
            address</span
          >
        </li>
        <li class="flex items-start gap-3">
          <span
            class="mt-1 w-5 h-5 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >2</span
          >
          <span
            ><span class="text-dot-text-primary font-medium">Store your profile on-chain</span>
            &mdash; Link your Twitter, GitHub, website, and bio to your name</span
          >
        </li>
        <li class="flex items-start gap-3">
          <span
            class="mt-1 w-5 h-5 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >3</span
          >
          <span
            ><span class="text-dot-text-primary font-medium">Host decentralised websites</span>
            &mdash; Set an IPFS content hash and serve your site at
            <code class="text-dot-accent">yourname.dot</code></span
          >
        </li>
        <li class="flex items-start gap-3">
          <span
            class="mt-1 w-5 h-5 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >4</span
          >
          <span
            ><span class="text-dot-text-primary font-medium">Create subdomains</span> &mdash;
            Organize with <code class="text-dot-accent">blog.alice.dot</code>,
            <code class="text-dot-accent">gov.mydao.dot</code></span
          >
        </li>
      </ul>
    </div>

    <TryItSection title="Try it — Resolve a .dot name">
      <TryResolveName />
    </TryItSection>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Built on Polkadot</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        DotNS runs on Polkadot's EVM-compatible layer (Revive), using a system of 8 smart contracts
        that handle registration, resolution, content storage, and proof of personhood. The protocol
        treats the chain as a database &mdash; deterministic discovery, bounded call complexity, and
        immutability where it matters.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The 8 Contracts</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RouterLink
          v-for="contract in contracts"
          :key="contract.name"
          :to="contract.path"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent transition-colors"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ contract.name }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ contract.description }}</p>
        </RouterLink>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6">
      <p class="text-sm text-dot-text-tertiary">
        Ready to get started?
        <RouterLink to="/docs/getting-started" class="text-dot-accent hover:text-dot-accent-hover"
          >Register your first .dot name &rarr;</RouterLink
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import TryItSection from "@/components/docs/TryItSection.vue";
import TryResolveName from "@/components/docs/interactive/TryResolveName.vue";

const contracts = [
  {
    name: "Registry",
    path: "/docs/contracts/registry",
    description: "Source of truth for node ownership and resolver addresses",
  },
  {
    name: "Registrar",
    path: "/docs/contracts/registrar",
    description: "ERC721 NFT backing permanent .dot name ownership",
  },
  {
    name: "Controller",
    path: "/docs/contracts/controller",
    description: "Commit-reveal registration with PoP and pricing",
  },
  {
    name: "Resolver",
    path: "/docs/contracts/resolver",
    description: "Forward resolution: name to address",
  },
  {
    name: "Reverse Resolver",
    path: "/docs/contracts/reverse-resolver",
    description: "Reverse resolution: address to primary name",
  },
  {
    name: "Content Resolver",
    path: "/docs/contracts/content-resolver",
    description: "Text records and IPFS content hashes",
  },
  {
    name: "PoP Rules",
    path: "/docs/contracts/pop-rules",
    description: "Name classification, pricing oracle, and PoP enforcement",
  },
  {
    name: "Store",
    path: "/docs/contracts/store",
    description: "Per-user key-value storage with immutable records",
  },
];
</script>
