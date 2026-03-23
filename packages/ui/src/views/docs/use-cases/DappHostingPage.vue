<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">dApp Hosting</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Host your decentralised application on a <span class="font-mono text-dot-accent">.dot</span>
        domain. Build your frontend, upload it to Bulletin or IPFS, set the content hash, and serve
        your dApp at a human-readable URL &mdash; censorship-resistant and always available.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why Decentralised Hosting?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Traditional web hosting relies on centralised servers, DNS registrars, and cloud providers.
        Any of these can go down, be censored, or change their terms of service. By hosting your
        dApp on a .dot domain with content-addressed storage, you eliminate every centralised
        dependency.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="point in advantages"
          :key="point.title"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ point.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ point.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployment Pipeline</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Deploying a dApp to a .dot domain follows the same pattern as any static site deployment,
        with decentralised storage replacing traditional hosting.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in pipelineSteps"
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
              <p class="text-sm text-dot-text-secondary mt-0.5">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Build Your dApp</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Build your frontend as a static bundle. Most modern frameworks support static export out of
        the box.
      </p>
      <DocCodeBlock :code="buildCode" lang="bash" filename="terminal" />
      <DocCallout variant="info" title="Client-side routing">
        If your dApp uses client-side routing (e.g., React Router, Vue Router), configure your build
        to use hash-based routing or make sure a fallback
        <span class="font-mono">index.html</span> is served for all routes. The DotNS gateway
        handles this automatically for single-page applications.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Upload &amp; Set Content Hash</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Upload your build output and set the resulting content hash on your .dot name.
      </p>
      <DocCodeBlock :code="uploadCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Access Your dApp</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Your dApp is now live on the decentralised web. Users access it through the DotNS gateway,
        which resolves the name and serves the content transparently.
      </p>
      <DocCodeBlock :code="accessCode" lang="bash" filename="accessing your dApp" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Censorship Resistance</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every layer of the stack is decentralised. The name resolution lives on Polkadot smart
        contracts. The content is stored on Bulletin (on-chain) or IPFS (peer-to-peer). The gateway
        is open-source and can be self-hosted. No single entity can take your dApp down.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Layer</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Traditional</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">DotNS</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="comparison in comparisons" :key="comparison.layer" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ comparison.layer }}</td>
              <td class="px-4 py-3 text-dot-text-tertiary">{{ comparison.traditional }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ comparison.dotns }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <DocCallout variant="tip" title="Automate with CI/CD">
      For production dApps, use the DotNS
      <RouterLink
        to="/docs/dweb/deploy-workflow"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Deploy Workflow
      </RouterLink>
      to automate the entire build-upload-deploy pipeline on every push to main.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/personal-identity"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Personal Identity
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/ci-cd-previews"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        CI/CD Previews &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const advantages = [
  {
    title: "Censorship-Resistant",
    description:
      "No central authority can take your dApp offline. Content lives on-chain or on IPFS.",
  },
  {
    title: "Always Available",
    description:
      "Bulletin stores content on Polkadot. As long as the chain runs, your dApp is live.",
  },
  {
    title: "Verifiable",
    description:
      "Content-addressed storage means users can verify they are seeing the exact code you deployed.",
  },
];

const pipelineSteps = [
  {
    title: "Build your frontend",
    description:
      "Compile your dApp into a static bundle (HTML, CSS, JS) using your framework's build command.",
  },
  {
    title: "Upload to decentralised storage",
    description:
      "Push the build output to Bulletin or IPFS. The CLI handles chunking, DAG construction, and upload.",
  },
  {
    title: "Set the content hash",
    description:
      "Link the resulting CID to your .dot name by calling setContenthash on the ContentResolver contract.",
  },
  {
    title: "Access via gateway",
    description:
      "Users visit your .dot domain. The gateway resolves the name, fetches the content, and serves it.",
  },
];

const comparisons = [
  {
    layer: "Naming",
    traditional: "DNS registrar (centralised)",
    dotns: "On-chain smart contracts (Polkadot)",
  },
  {
    layer: "Storage",
    traditional: "Cloud server (AWS, Vercel)",
    dotns: "Bulletin chain / IPFS (decentralised)",
  },
  {
    layer: "Resolution",
    traditional: "DNS servers (can be censored)",
    dotns: "On-chain lookup (censorship-resistant)",
  },
  {
    layer: "Gateway",
    traditional: "CDN / Load balancer",
    dotns: "Open-source dweb-proxy (self-hostable)",
  },
];

const buildCode = `# React / Vite
npm run build        # Output: dist/

# Next.js (static export)
next build && next export   # Output: out/

# Vue / Vite
npm run build        # Output: dist/

# Plain HTML
# No build step needed — just point to your directory`;

const uploadCode = `# Upload to Bulletin
dotns bulletin upload ./dist
# Root CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi

# Set the content hash on your .dot name
dotns content set mydapp bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi`;

const accessCode = `# Testnet
https://mydapp.dotns.paseo.li

# Mainnet (via gateway)
https://mydapp.dot

# Verify with curl
curl -H "Host: mydapp.dot" https://gateway.dotns.dev`;
</script>
