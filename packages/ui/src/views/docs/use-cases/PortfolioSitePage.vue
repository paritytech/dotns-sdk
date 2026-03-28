<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Portfolio Site</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Build a personal portfolio site and host it on your
        <span class="font-mono text-dot-accent">.dot</span> domain. Use any static site generator,
        upload to Bulletin, set the content hash, and your portfolio is live at
        <span class="font-mono text-dot-accent">yourname.dot</span> &mdash; no hosting fees, no
        server maintenance, no renewal anxiety.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why Host on .dot?</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="reason in reasons"
          :key="reason.title"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ reason.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ reason.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Choose a Static Site Generator</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Any static site generator works with DotNS hosting. Here are some popular options and their
        build commands:
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Generator</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Build Command</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Output</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="gen in generators" :key="gen.name" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ gen.name }}</td>
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ gen.command }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-tertiary text-xs">{{ gen.output }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="tip" title="Plain HTML works too">
        You do not need a build tool. A directory with an
        <span class="font-mono">index.html</span> file is enough. Point the CLI at your directory
        and upload.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Step-by-Step: Deploy Your Portfolio
      </h2>

      <h3 class="text-lg font-medium text-dot-text-primary mt-6">1. Build your site</h3>
      <DocCodeBlock :code="buildCode" lang="bash" filename="terminal" />

      <h3 class="text-lg font-medium text-dot-text-primary mt-6">2. Upload to Bulletin</h3>
      <DocCodeBlock :code="uploadCode" lang="bash" filename="terminal" />

      <h3 class="text-lg font-medium text-dot-text-primary mt-6">3. Set the content hash</h3>
      <DocCodeBlock :code="setHashCode" lang="bash" filename="terminal" />

      <h3 class="text-lg font-medium text-dot-text-primary mt-6">4. Visit your site</h3>
      <DocCodeBlock :code="visitCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Complete Example: Hugo Portfolio</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Here is a complete workflow for creating and deploying a Hugo-based portfolio site to your
        .dot domain.
      </p>
      <DocCodeBlock :code="hugoExample" lang="bash" filename="full deployment example" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Updating Your Site</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When you make changes, rebuild, re-upload, and update the content hash. Previous versions
        remain accessible by their CID &mdash; nothing is deleted.
      </p>
      <DocCodeBlock :code="updateCode" lang="bash" filename="terminal" />
      <DocCallout variant="info" title="Version history">
        Because content is stored by hash, every deployment creates an immutable snapshot. You can
        access previous versions of your site by their CID, even after updating the content hash on
        your .dot name.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Automate with CI/CD</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        For a hands-off workflow, set up the DotNS Deploy Workflow to automatically build and deploy
        your portfolio whenever you push to your main branch.
      </p>
      <DocCodeBlock :code="cicdCode" lang="yaml" filename=".github/workflows/deploy.yml" />
      <p class="text-dot-text-secondary leading-relaxed">
        See the
        <RouterLink
          to="/docs/dweb/deploy-workflow"
          class="text-dot-accent hover:text-dot-accent-hover"
        >
          Deploy Workflow
        </RouterLink>
        docs for full configuration options.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Complete Your Identity</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        While you are at it, set up text records on your .dot name to create a complete on-chain
        identity alongside your portfolio site.
      </p>
      <DocCodeBlock :code="profileCode" lang="bash" filename="terminal" />
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/dao-naming"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; DAO Naming
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/wallet-integration"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Wallet &amp; DeFi &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const reasons = [
  {
    title: "No Hosting Fees",
    description:
      "Pay once to upload to Bulletin. No monthly bills, no server costs, no bandwidth charges.",
  },
  {
    title: "Permanent Availability",
    description:
      "Content stored on Bulletin is on-chain and always available. No server to keep running.",
  },
  {
    title: "Memorable URL",
    description:
      "yourname.dot is cleaner and more professional than yourname.github.io or a random subdomain.",
  },
  {
    title: "True Ownership",
    description:
      "Your domain is an NFT you own. No registrar can revoke it, no platform can deplatform you.",
  },
];

const generators = [
  { name: "Hugo", command: "hugo --minify", output: "public/" },
  { name: "Astro", command: "astro build", output: "dist/" },
  { name: "Vite", command: "vite build", output: "dist/" },
  { name: "Eleventy", command: "eleventy", output: "_site/" },
  { name: "Jekyll", command: "jekyll build", output: "_site/" },
  { name: "Next.js", command: "next build && next export", output: "out/" },
  { name: "Plain HTML", command: "(none)", output: "your directory" },
];

const buildCode = `# Example with Hugo
hugo --minify

# Example with Astro
astro build

# Example with Vite
npm run build`;

const uploadCode = `# Upload the build output to Bulletin
dotns bulletin upload ./public

# Output:
# Merkleising directory: 18 files (1.2 MB)
# Root CID: bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle`;

const setHashCode = `# Set the content hash on your .dot name
dotns content set yourname bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle`;

const visitCode = `# Your portfolio is now live!
# Testnet: https://yourname.dotns.paseo.li
# Mainnet: https://yourname.dot (via gateway)`;

const hugoExample = `# 1. Create a new Hugo site
hugo new site my-portfolio
cd my-portfolio
hugo new posts/hello-world.md

# 2. Build the site
hugo --minify

# 3. Upload to Bulletin
dotns bulletin upload ./public
# Root CID: bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle

# 4. Set the content hash
dotns content set yourname bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle

# 5. Your portfolio is live at yourname.dot`;

const updateCode = `# Make changes to your site, then rebuild
hugo --minify

# Re-upload (only changed files are uploaded thanks to content-addressable caching)
dotns bulletin upload ./public
# New Root CID: bafybeiabcdef...

# Update the content hash
dotns content set yourname bafybeiabcdef...

# The old version is still accessible at its original CID`;

const cicdCode = `name: Deploy Portfolio
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: paritytech/dotns-sdk/.github/workflows/deploy.yml@main
    with:
      basename: yourname
      mode: production
      parallel: 4
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const profileCode = `# View your current on-chain profile
dotns content view yourname

# Set text records via the CLI
dotns text set yourname description "My portfolio"
dotns text set yourname url "https://yourname.dev"

# To enable reverse resolution, register with the -r flag:
dotns register domain --name yourname -r`;
</script>
