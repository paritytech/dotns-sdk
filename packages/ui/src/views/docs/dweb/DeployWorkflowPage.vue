<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Deploy Workflow</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The DotNS SDK includes a reusable GitHub Actions workflow that automates your full
        deployment pipeline &mdash; build, upload to Bulletin, and set the content hash on your .dot
        domain. It supports both
        <span class="text-dot-text-primary font-medium">preview</span> and
        <span class="text-dot-text-primary font-medium">production</span> modes.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Two Deployment Modes</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface space-y-2">
          <p class="text-sm font-medium text-dot-text-primary">Preview Mode</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Creates a unique subname for each pull request, such as
            <span class="font-mono text-dot-accent">pr42.mysite.dot</span>. Reviewers can preview
            changes on a live URL before merging.
          </p>
          <p class="text-xs font-mono text-dot-text-tertiary mt-2">mode: preview</p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface space-y-2">
          <p class="text-sm font-medium text-dot-text-primary">Production Mode</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Deploys to the base domain (e.g.,
            <span class="font-mono text-dot-accent">mysite.dot</span>) on merge to main. The live
            site is updated with the new content hash.
          </p>
          <p class="text-xs font-mono text-dot-text-tertiary mt-2">mode: production</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Workflow Inputs</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Input</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Required</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="input in workflowInputs" :key="input.name" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ input.name }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ input.required }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ input.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Required Secrets</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The workflow needs two mnemonics (secret recovery phrases) stored as GitHub repository
        secrets. These sign transactions for Bulletin uploads and DotNS content hash updates.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Secret</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">DOTNS_MNEMONIC</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Mnemonic for the EVM account that owns the .dot name. Used to set content hashes and
                create subnames.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">BULLETIN_MNEMONIC</td>
              <td class="px-4 py-3 text-dot-text-secondary">
                Mnemonic for the Substrate account used to submit Bulletin storage transactions.
                Must have sufficient balance on the Bulletin parachain.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="warning" title="Keep secrets safe">
        Never commit mnemonics to your repository. Always use GitHub encrypted secrets. Consider
        using dedicated deployment accounts with limited permissions rather than personal wallets.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Example: Preview Deploys on PR</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        This workflow runs on every pull request, creating a unique subname so reviewers can preview
        changes at a live URL.
      </p>
      <DocCodeBlock
        :code="previewWorkflowCode"
        lang="yaml"
        filename=".github/workflows/preview.yml"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Example: Production Deploy on Merge
      </h2>
      <p class="text-dot-text-secondary leading-relaxed">
        This workflow runs when a pull request is merged to main, deploying to the base domain.
      </p>
      <DocCodeBlock
        :code="productionWorkflowCode"
        lang="yaml"
        filename=".github/workflows/deploy.yml"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Subname Formats</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        In preview mode, the workflow creates subnames based on the
        <span class="font-mono text-dot-accent">subname-format</span> input. This determines how the
        preview URL is generated from the pull request context.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Format</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="fmt in subnameFormats" :key="fmt.format" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ fmt.format }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-secondary text-xs">{{ fmt.example }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ fmt.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Upload Performance &amp; Concurrency
      </h2>
      <p class="text-dot-text-secondary leading-relaxed">
        For large sites, pass <span class="font-mono text-dot-accent">--as-car</span> to merkleise
        the directory in-memory and upload it as a chunked CAR file. This is significantly faster
        than per-block directory uploads and requires no external IPFS binary (Kubo). The workflow
        also supports concurrency controls and GitHub Actions concurrency groups to prevent
        conflicting deployments.
      </p>
      <DocCodeBlock :code="parallelCode" lang="yaml" filename="parallel configuration" />
      <DocCallout variant="tip" title="Content-addressable caching">
        Because Bulletin blocks are content-addressed, uploading the same file twice has no effect.
        The workflow skips blocks that already exist on-chain, making incremental deploys fast.
      </DocCallout>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dweb/gateway"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Gateway
      </RouterLink>
      <RouterLink to="/docs/tools/cli" class="text-dot-accent hover:text-dot-accent-hover">
        CLI &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const workflowInputs = [
  {
    name: "basename",
    required: "Yes",
    description: "The base .dot domain name (e.g., mysite). Content is deployed to mysite.dot.",
  },
  {
    name: "mode",
    required: "Yes",
    description: "Deployment mode: 'preview' for PR subnames, 'production' for the base domain.",
  },
  {
    name: "subname-format",
    required: "No",
    description:
      "Template for preview subnames. Default: 'pr{number}'. Supports {number}, {branch}, {sha}.",
  },
  {
    name: "parallel",
    required: "No",
    description:
      "Number of parallel Bulletin upload workers. Default: 4. Increase for large sites.",
  },
  {
    name: "as-car",
    required: "No",
    description:
      "Legacy — the bulletin action now auto-detects directories and uses chunked CAR upload by default. Kept for backwards compatibility.",
  },
  {
    name: "concurrency",
    required: "No",
    description: "GitHub Actions concurrency group. Prevents conflicting simultaneous deploys.",
  },
  {
    name: "cache",
    required: "No",
    description:
      "Boolean (default: false). Write the uploaded CID to the user's on-chain Store. Requires sufficient PAS balance on Asset Hub. If the Store does not exist, one will be deployed automatically. Skips gracefully if the balance is insufficient.",
  },
];

const subnameFormats = [
  {
    format: "pr{number}",
    example: "pr42.mysite.dot",
    description: "Default. Uses the PR number for a short, predictable URL.",
  },
  {
    format: "{branch}",
    example: "feat-login.mysite.dot",
    description: "Uses the branch name. Useful for long-lived feature branches.",
  },
  {
    format: "pr{number}-{sha}",
    example: "pr42-a1b2c3d.mysite.dot",
    description: "Includes the short commit SHA for exact version identification.",
  },
];

const previewWorkflowCode = `name: Preview Deploy
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  deploy:
    uses: paritytech/dotns-sdk/.github/workflows/deploy.yml@main
    with:
      basename: mysite
      mode: preview
      subname-format: "pr{number}"
      parallel: 4
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const productionWorkflowCode = `name: Production Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: paritytech/dotns-sdk/.github/workflows/deploy.yml@main
    with:
      basename: mysite
      mode: production
      parallel: 8
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const parallelCode = `# --as-car mode with concurrency for fast uploads
with:
  as-car: true         # legacy — the action auto-detects directories
  parallel: 8          # 8 concurrent chunk uploads

# Concurrency prevents conflicting deploys
concurrency:
  group: deploy-mysite-\${{ github.ref }}
  cancel-in-progress: true   # Cancel outdated preview deploys`;
</script>
