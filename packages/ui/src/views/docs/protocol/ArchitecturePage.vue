<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Architecture</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS is composed of
        <span class="text-dot-text-primary font-medium">8 smart contracts</span>
        deployed on Paseo AssetHub. Each contract has a single responsibility, and together they
        form a modular naming system with registration, resolution, content management, and
        proof-of-personhood pricing.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Contracts</h2>
      <p class="text-dot-text-secondary text-sm">
        All contracts are deployed on the Paseo AssetHub testnet. Addresses are shown below.
      </p>
      <div class="space-y-3">
        <div
          v-for="contract in contracts"
          :key="contract.name"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-dot-text-primary">{{ contract.name }}</p>
              <p class="text-xs text-dot-text-tertiary mt-1">{{ contract.description }}</p>
            </div>
          </div>
          <p class="mt-2 text-xs font-mono text-dot-accent break-all">{{ contract.address }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Contract Relationships</h2>
      <p class="text-dot-text-secondary text-sm leading-relaxed">
        The diagram below illustrates how the contracts interact during registration and resolution.
        The Controller orchestrates the flow, while the Registry serves as the central source of
        truth.
      </p>

      <DocDiagramImage
        src="/diagrams/system.png"
        alt="DotNS system diagram showing client interfaces, smart contracts, external systems, proxy, and blockchain layers"
        caption="DotNS System Diagram"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registration Flow</h2>
      <div class="space-y-3">
        <div
          v-for="(step, i) in flowSteps"
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Resolution Flow</h2>
      <p class="text-dot-text-secondary text-sm leading-relaxed">
        Once registered, name resolution is straightforward. The
        <span class="font-mono text-dot-accent">Registry</span>
        maps a node to its owner and resolver address. Callers query the
        <span class="font-mono text-dot-accent">Resolver</span> for forward lookups (name to
        address), the <span class="font-mono text-dot-accent">ReverseResolver</span> for reverse
        lookups (address to name), and the
        <span class="font-mono text-dot-accent">ContentResolver</span>
        for text records and content hashes.
      </p>
    </div>

    <DocCallout variant="info" title="Modular design">
      Each contract can be upgraded independently. The Registry is the only contract that stores
      ownership data &mdash; resolvers are stateless lookups that can be swapped without migrating
      names.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/getting-started"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Getting Started
      </RouterLink>
      <RouterLink to="/docs/protocol/naming" class="text-dot-accent hover:text-dot-accent-hover">
        The .dot Namespace &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocDiagramImage from "@/components/docs/DocDiagramImage.vue";

const contracts = [
  {
    name: "DotnsRegistry",
    description: "Source of truth for node ownership and resolver addresses.",
    address: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
  },
  {
    name: "DotnsRegistrar",
    description: "ERC721 NFT that backs permanent .dot name ownership.",
    address: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD",
  },
  {
    name: "DotnsRegistrarController",
    description: "Orchestrates commit-reveal registration with pricing and PoP checks.",
    address: "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651",
  },
  {
    name: "DotnsResolver",
    description: "Forward resolution: maps a name (node) to an address.",
    address: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
  },
  {
    name: "DotnsReverseResolver",
    description: "Reverse resolution: maps an address to its primary .dot name.",
    address: "0x95D57363B491CF743970c640fe419541386ac8BF",
  },
  {
    name: "DotnsContentResolver",
    description: "Stores text records (twitter, github, etc.) and IPFS content hashes.",
    address: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7",
  },
  {
    name: "PopRules",
    description: "Name classification engine and pricing oracle based on proof of personhood.",
    address: "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3",
  },
  {
    name: "StoreFactory",
    description: "Deploys per-user key-value Store contracts for on-chain registration records.",
    address: "0x030296782F4d3046B080BcB017f01837561D9702",
  },
];

const flowSteps = [
  {
    title: "Controller consults PopRules",
    description:
      "The Controller calls PopRules to classify the name and determine the required price based on the user's PoP status and name length.",
  },
  {
    title: "Controller calls Registrar to mint NFT",
    description:
      "The Registrar mints an ERC721 token representing ownership of the .dot name. The tokenId is derived from the node hash.",
  },
  {
    title: "Registrar updates Registry",
    description:
      "The Registrar writes the owner and resolver addresses into the Registry for the registered node.",
  },
  {
    title: "Controller writes to Store",
    description:
      "The Controller writes an immutable registration record to the user's per-user Store via StoreFactory.",
  },
  {
    title: "Resolvers become queryable",
    description:
      "The Resolver, ReverseResolver, and ContentResolver can now serve queries for the newly registered name.",
  },
];
</script>
