<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Overview</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The vision is simple: type
        <span class="font-mono text-dot-accent">alice.dot</span> into a browser and see a website
        &mdash; no centralised server, no DNS registrar, no single point of failure. DotNS makes
        this possible by combining on-chain name resolution with decentralised content storage.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Full Stack</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Serving a decentralised website through DotNS involves three layers working together.
        Content is stored on <span class="text-dot-text-primary font-medium">Bulletin</span>
        (Polkadot's on-chain block storage) or
        <span class="text-dot-text-primary font-medium">IPFS</span>. The content hash referencing
        that storage is set in the
        <span class="font-mono text-dot-accent">DotnsContentResolver</span> contract. Finally, a
        <span class="text-dot-text-primary font-medium">dweb-proxy</span> gateway resolves the name,
        fetches the content, and serves it to the browser.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Request Flow</h2>
      <div class="border border-dot-border rounded-xl p-6 bg-dot-surface space-y-6">
        <div class="flex flex-col gap-4">
          <div v-for="(step, i) in flowSteps" :key="i" class="flex items-start gap-4">
            <span
              class="mt-0.5 w-7 h-7 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
              >{{ i + 1 }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-dot-text-primary font-medium">{{ step.title }}</p>
              <p class="text-sm text-dot-text-secondary mt-0.5">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">CID Flow via Bulletin Chain</h2>
      <DocDiagramImage
        src="/diagrams/cid.png"
        alt="CID flow via Bulletin Chain showing content upload, setContenthash, and read operations"
        caption="CID Flow via Bulletin Chain"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Storage Backends</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        DotNS supports multiple decentralised storage protocols. The content hash stored in the
        ContentResolver encodes which protocol to use and where to find the content.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Protocol</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Prefix</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="backend in storageBackends" :key="backend.protocol" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ backend.protocol }}</td>
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ backend.prefix }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ backend.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Concepts</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="concept in keyConcepts"
          :key="concept.title"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ concept.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ concept.description }}</p>
        </div>
      </div>
    </div>

    <DocCallout variant="tip" title="No browser extension required">
      Unlike ENS which requires a browser extension or special DNS configuration, DotNS uses a
      gateway proxy that intercepts HTTP requests by Host header. Any standard browser can access
      .dot websites through the gateway.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/store"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Store
      </RouterLink>
      <RouterLink to="/docs/dweb/hosting" class="text-dot-accent hover:text-dot-accent-hover">
        Host a Website &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocDiagramImage from "@/components/docs/DocDiagramImage.vue";

const flowSteps = [
  {
    title: "User visits alice.dot",
    description:
      "The browser sends an HTTP request. The Host header is alice.dot, which the gateway intercepts.",
  },
  {
    title: "Gateway resolves the name",
    description:
      "The dweb-proxy queries the DotNS ContentResolver contract to retrieve the content hash for alice.dot.",
  },
  {
    title: "Content hash decoded",
    description:
      "The multicodec-encoded content hash tells the gateway which storage protocol (IPFS, Bulletin, Arweave, etc.) and which CID to fetch.",
  },
  {
    title: "Content fetched from storage",
    description:
      "The gateway fetches the content from Bulletin chain, an IPFS node, or another supported storage backend.",
  },
  {
    title: "Website served to browser",
    description:
      "The gateway returns the HTML, CSS, and JavaScript files to the browser. The user sees a fully functional website.",
  },
];

const storageBackends = [
  {
    protocol: "IPFS",
    prefix: "ipfs://",
    description: "Content-addressed storage via the InterPlanetary File System",
  },
  {
    protocol: "IPNS",
    prefix: "ipns://",
    description: "Mutable pointers to IPFS content for dynamic updates",
  },
  {
    protocol: "Bulletin",
    prefix: "bulletin://",
    description: "Polkadot's on-chain IPFS block storage for permanent availability",
  },
  {
    protocol: "Arweave",
    prefix: "ar://",
    description: "Permanent storage on the Arweave permaweb",
  },
  {
    protocol: "Swarm",
    prefix: "bzz://",
    description: "Ethereum Swarm decentralised storage network",
  },
];

const keyConcepts = [
  {
    title: "Content Addressing",
    description:
      "Files are identified by their cryptographic hash, not by location. The same content always produces the same hash.",
  },
  {
    title: "On-chain Resolution",
    description:
      "Name-to-content-hash mapping lives on Polkadot, making it censorship-resistant and trustless.",
  },
  {
    title: "Gateway Proxy",
    description:
      "dweb-proxy translates HTTP requests into on-chain lookups and storage fetches transparently.",
  },
  {
    title: "Immutable Deployments",
    description:
      "Each deployment produces a unique content hash. Previous versions remain accessible forever.",
  },
];
</script>
