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
        The diagram below shows how the contracts interact during registration and resolution. The
        Controller coordinates each step, while the Registry holds the definitive record of who owns
        each name.
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
        Once registered, name lookup is straightforward. The
        <span class="font-mono text-dot-accent">Registry</span>
        maps each node (a unique hash that identifies a name) to its owner and resolver address.
        Query the <span class="font-mono text-dot-accent">Resolver</span> to convert a name to an
        address, the <span class="font-mono text-dot-accent">ReverseResolver</span> to convert an
        address back to a name, and the
        <span class="font-mono text-dot-accent">ContentResolver</span>
        to read profile records and content hashes.
      </p>
    </div>

    <DocCallout variant="info" title="Modular design">
      Each contract can be upgraded independently. The Registry is the only contract that stores
      ownership data &mdash; resolvers hold no state of their own and can be replaced without
      migrating names.
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
    description: "Central record of who owns each name and which resolver handles it.",
    address: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
  },
  {
    name: "DotnsRegistrar",
    description: "ERC721 NFT contract that represents permanent .dot name ownership.",
    address: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD",
  },
  {
    name: "DotnsRegistrarController",
    description:
      "Coordinates the commit-reveal registration flow, including pricing and proof-of-personhood checks.",
    address: "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651",
  },
  {
    name: "DotnsResolver",
    description: "Converts a .dot name into an on-chain address (forward resolution).",
    address: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
  },
  {
    name: "DotnsReverseResolver",
    description: "Converts an address back to its primary .dot name (reverse resolution).",
    address: "0x95D57363B491CF743970c640fe419541386ac8BF",
  },
  {
    name: "DotnsContentResolver",
    description: "Stores profile text records (Twitter, GitHub, etc.) and IPFS content hashes.",
    address: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7",
  },
  {
    name: "PopRules",
    description: "Classifies names by length and sets pricing based on proof-of-personhood status.",
    address: "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3",
  },
  {
    name: "StoreFactory",
    description:
      "Deploys a personal key-value Store contract for each user to hold their registration records on-chain.",
    address: "0x030296782F4d3046B080BcB017f01837561D9702",
  },
];

const flowSteps = [
  {
    title: "Controller consults PopRules",
    description:
      "The Controller calls PopRules to classify the name and calculate the registration price based on the user's proof-of-personhood status and name length.",
  },
  {
    title: "Controller calls Registrar to mint NFT",
    description:
      "The Registrar mints an ERC721 token (NFT) that represents ownership of the .dot name. The token ID comes from the name's node hash.",
  },
  {
    title: "Registrar updates Registry",
    description:
      "The Registrar writes the owner and resolver addresses into the Registry for the newly registered name.",
  },
  {
    title: "Controller writes to Store",
    description:
      "The Controller writes a permanent registration record to the user's personal Store contract through StoreFactory.",
  },
  {
    title: "Resolvers become queryable",
    description:
      "The Resolver, ReverseResolver, and ContentResolver can now answer queries for the newly registered name.",
  },
];
</script>
