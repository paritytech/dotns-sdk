<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Overview</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS is composed of
        <span class="text-dot-text-primary font-medium">8 smart contracts</span>
        deployed on Paseo AssetHub. Each contract has a single responsibility, and together they
        form the complete naming, resolution, and content management system.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Contracts</h2>
      <p class="text-dot-text-secondary text-sm">
        All contracts are live on the Paseo AssetHub testnet. Select any contract below to view its
        full API reference.
      </p>
      <div class="space-y-3">
        <RouterLink
          v-for="contract in contracts"
          :key="contract.name"
          :to="contract.link"
          class="block p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent/50 transition-colors"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-dot-text-primary">{{ contract.name }}</p>
              <p class="text-xs text-dot-text-tertiary mt-1">{{ contract.description }}</p>
            </div>
          </div>
          <p class="mt-2 text-xs font-mono text-dot-accent break-all">{{ contract.address }}</p>
        </RouterLink>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Contract Interaction Pattern</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Most users interact with DotNS through the
        <span class="font-mono text-dot-accent">RegistrarController</span>, which orchestrates the
        commit-reveal registration flow. The
        <span class="font-mono text-dot-accent">Registry</span> serves as the central source of
        truth, and the three resolver contracts handle forward, reverse, and content resolution
        independently.
      </p>
    </div>

    <DocCallout variant="info" title="Testnet addresses">
      These addresses are deployed on Paseo AssetHub. Contract addresses will change when the
      protocol launches on mainnet. Always verify addresses against the official documentation.
    </DocCallout>

    <div id="types" class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Type Definitions</h2>
      <p class="text-dot-text-secondary text-sm">
        Several contracts share these struct and enum types. Refer to these definitions when reading
        function signatures on individual contract pages.
      </p>

      <div class="space-y-2">
        <h3 class="text-base font-semibold text-dot-text-primary font-mono">Registration</h3>
        <p class="text-sm text-dot-text-secondary">
          Used by the
          <RouterLink
            to="/docs/contracts/controller"
            class="text-dot-accent hover:text-dot-accent-hover"
            >Controller</RouterLink
          >
          for commit-reveal registration.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'label',
              type: 'string',
              description: 'Label being registered (e.g. alice)',
              required: true,
            },
            {
              name: 'owner',
              type: 'address',
              description: 'Address that will own the name',
              required: true,
            },
            {
              name: 'secret',
              type: 'bytes32',
              description: 'Random secret used to bind the commitment',
              required: true,
            },
            {
              name: 'reserved',
              type: 'bool',
              description: 'Whether this is a reserved name registration',
              required: true,
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <h3 class="text-base font-semibold text-dot-text-primary font-mono">SubnodeRecord</h3>
        <p class="text-sm text-dot-text-secondary">
          Used by the
          <RouterLink
            to="/docs/contracts/registry"
            class="text-dot-accent hover:text-dot-accent-hover"
            >Registry</RouterLink
          >
          for creating subdomains.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'parentNode',
              type: 'bytes32',
              description: 'Namehash of the parent domain',
              required: true,
            },
            {
              name: 'subLabel',
              type: 'string',
              description: 'Human-readable subdomain label (e.g. blog)',
              required: true,
            },
            {
              name: 'parentLabel',
              type: 'string',
              description: 'Human-readable parent label (e.g. alice)',
              required: true,
            },
            {
              name: 'owner',
              type: 'address',
              description: 'Address to assign as owner of the subdomain',
              required: true,
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <h3 class="text-base font-semibold text-dot-text-primary font-mono">PriceWithMeta</h3>
        <p class="text-sm text-dot-text-secondary">
          Returned by
          <RouterLink
            to="/docs/contracts/pop-rules"
            class="text-dot-accent hover:text-dot-accent-hover"
            >PoP Rules</RouterLink
          >
          pricing functions.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'price',
              type: 'uint256',
              description: 'Registration cost in wei (0 for PoP-verified users)',
              required: true,
            },
            {
              name: 'status',
              type: 'PopStatus',
              description: 'Required PoP tier for this name',
              required: true,
            },
            {
              name: 'userStatus',
              type: 'PopStatus',
              description: 'Current PoP status of the caller',
              required: true,
            },
            {
              name: 'message',
              type: 'string',
              description: 'Human-readable classification description',
              required: true,
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <h3 class="text-base font-semibold text-dot-text-primary font-mono">PopStatus</h3>
        <p class="text-sm text-dot-text-secondary">
          Enum representing proof-of-personhood tiers. Used in pricing and classification.
        </p>
        <div class="my-4 overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="border-b border-dot-border">
                <th class="text-left py-2 pr-4 text-dot-text-tertiary font-medium">Value</th>
                <th class="text-left py-2 pr-4 text-dot-text-tertiary font-medium">Name</th>
                <th class="text-left py-2 text-dot-text-tertiary font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in popStatuses" :key="s.value" class="border-b border-dot-border/50">
                <td class="py-2.5 pr-4">
                  <code
                    class="text-dot-accent text-xs font-mono bg-dot-surface-secondary px-1.5 py-0.5 rounded"
                    >{{ s.value }}</code
                  >
                </td>
                <td class="py-2.5 pr-4">
                  <code class="text-dot-text-secondary text-xs font-mono">{{ s.name }}</code>
                </td>
                <td class="py-2.5 text-dot-text-secondary">{{ s.meaning }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/transfers"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Transfers
      </RouterLink>
      <RouterLink to="/docs/contracts/registry" class="text-dot-accent hover:text-dot-accent-hover">
        Registry &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocParamTable from "@/components/docs/DocParamTable.vue";

const popStatuses = [
  { value: 0, name: "NoStatus", meaning: "Open registration, pay length-based fee" },
  { value: 1, name: "PopLite", meaning: "Basic proof-of-personhood verification required" },
  { value: 2, name: "PopFull", meaning: "Full proof-of-personhood verification required" },
  { value: 3, name: "Reserved", meaning: "Governance-reserved, requires reservation" },
];

const contracts = [
  {
    name: "DotnsRegistry",
    description: "Source of truth for node ownership and resolver addresses.",
    address: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
    link: "/docs/contracts/registry",
  },
  {
    name: "DotnsRegistrar",
    description: "ERC721 NFT that backs permanent .dot name ownership.",
    address: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD",
    link: "/docs/contracts/registrar",
  },
  {
    name: "DotnsRegistrarController",
    description: "Orchestrates commit-reveal registration with pricing and PoP checks.",
    address: "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651",
    link: "/docs/contracts/controller",
  },
  {
    name: "DotnsResolver",
    description: "Forward resolution: maps a name (node) to an address.",
    address: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
    link: "/docs/contracts/resolver",
  },
  {
    name: "DotnsReverseResolver",
    description: "Reverse resolution: maps an address to its primary .dot name.",
    address: "0x95D57363B491CF743970c640fe419541386ac8BF",
    link: "/docs/contracts/reverse-resolver",
  },
  {
    name: "DotnsContentResolver",
    description: "Stores text records (twitter, github, etc.) and IPFS content hashes.",
    address: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7",
    link: "/docs/contracts/content-resolver",
  },
  {
    name: "PopRules",
    description: "Name classification engine and pricing oracle based on proof of personhood.",
    address: "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3",
    link: "/docs/contracts/pop-rules",
  },
  {
    name: "StoreFactory",
    description: "Deploys per-user key-value Store contracts for on-chain registration records.",
    address: "0x030296782F4d3046B080BcB017f01837561D9702",
    link: "/docs/contracts/store",
  },
];
</script>
