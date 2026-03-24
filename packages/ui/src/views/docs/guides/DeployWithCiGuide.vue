<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Guides</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Deploy with CI</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Automate deployments with the reusable GitHub Actions workflow from dotns-sdk. Every pull
        request gets a preview subname, and merges to main deploy to production &mdash; all on the
        decentralised web.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How It Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The dotns-sdk repository provides a reusable workflow (<code class="text-dot-accent"
          >deploy.yml</code
        >) that handles the full pipeline: build your app, upload to Bulletin, register the domain
        or subname, and set the content hash. It supports two modes:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
          <p class="text-sm font-medium text-dot-text-primary">Preview</p>
          <p class="text-xs text-dot-text-secondary mt-2">
            Each pull request gets a subname like
            <code class="text-dot-accent">pr42.myapp.dot</code>. Reviewers can visit the preview and
            test changes on the decentralised web. The subname is cleaned up when the pull request
            closes.
          </p>
        </div>
        <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
          <p class="text-sm font-medium text-dot-text-primary">Production</p>
          <p class="text-xs text-dot-text-secondary mt-2">
            Merges to main deploy to the base domain
            <code class="text-dot-accent">myapp.dot</code>. The content hash is updated to point to
            the new build. Previous versions remain accessible by their CID.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Prerequisites</h2>
      <div class="space-y-2">
        <div
          v-for="(req, i) in prerequisites"
          :key="i"
          class="flex items-start gap-3 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <span
            class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >{{ i + 1 }}</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ req.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ req.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Add the Workflow</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Create <code class="text-dot-accent">.github/workflows/deploy.yml</code> in your repository.
        This calls the reusable workflow from dotns-sdk:
      </p>
      <DocCodeBlock :code="workflowCode" lang="yaml" filename=".github/workflows/deploy.yml" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Configure Secrets</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Add two secrets to your repository (Settings &rarr; Secrets and variables &rarr; Actions):
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
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                BIP39 mnemonic (seed phrase) for the account that owns the base domain. Used for
                registration and content hash updates.
              </td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">BULLETIN_MNEMONIC</td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                BIP39 mnemonic (seed phrase) for the Bulletin-authorised account. Used for uploading
                build artefacts to Bulletin storage.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="warning" title="Separate accounts recommended">
        Use separate accounts for DotNS and Bulletin operations. The DotNS account needs PAS on
        AssetHub; the Bulletin account needs authorisation on the Bulletin parachain.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Workflow Inputs</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Input</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Default</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="input in workflowInputs" :key="input.name" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ input.name }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-secondary text-xs">
                {{ input.default }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">{{ input.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What the Pipeline Does</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The reusable workflow runs three composite actions in sequence:
      </p>
      <div class="space-y-3">
        <div
          v-for="(action, i) in pipelineSteps"
          :key="i"
          class="flex items-start gap-4 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div
            class="w-8 h-8 rounded-lg bg-dot-surface-secondary text-dot-text-primary flex items-center justify-center text-sm font-bold shrink-0"
          >
            {{ i + 1 }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ action.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ action.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Content-Addressable Caching</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The workflow computes the CID of your build output before uploading. If the CID already
        matches the on-chain content hash, it skips both the upload and the content hash update. No
        wasted transactions, no duplicate uploads. Rebuilding the same code produces no changes.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Preview Subname Format</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <code class="text-dot-accent">subname-format</code> input controls how preview subnames
        are generated. The default format is <code class="text-dot-accent">pr{number}</code>, which
        produces subnames like <code class="text-dot-accent">pr42.myapp.dot</code>. You can
        customise it &mdash; for example,
        <code class="text-dot-accent">preview-{number}</code> would produce
        <code class="text-dot-accent">preview-42.myapp.dot</code>.
      </p>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/guides/host-a-website"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Host a Website
      </RouterLink>
      <RouterLink
        to="/docs/guides/create-subdomains"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Create Subdomains &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const prerequisites = [
  {
    title: "A registered .dot domain",
    description:
      "Your base domain (e.g. myapp.dot) must already be registered. The workflow creates subnames under it for previews.",
  },
  {
    title: "Bulletin authorisation",
    description:
      "The account used for uploads needs TransactionStorage authorisation on the Bulletin parachain.",
  },
  {
    title: "Repository secrets",
    description:
      "DOTNS_MNEMONIC and BULLETIN_MNEMONIC must be configured in your GitHub repo settings.",
  },
];

const workflowCode = `name: Deploy to DotNS

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/

  deploy:
    needs: build
    uses: paritytech/dotns-sdk/.github/workflows/deploy.yml@main
    with:
      basename: myapp
      mode: \${{ github.event_name == 'push' && 'production' || 'preview' }}
      artifact-name: build
      parallel: true
      concurrency: 4
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const workflowInputs = [
  {
    name: "basename",
    default: "—",
    description: "Your .dot domain label (e.g. 'myapp' for myapp.dot). Required.",
  },
  {
    name: "mode",
    default: "preview",
    description: "'preview' creates a PR subname; 'production' deploys to the base domain.",
  },
  {
    name: "artifact-name",
    default: "build",
    description: "Name of the uploaded build artefact to deploy.",
  },
  {
    name: "subname-format",
    default: "pr{number}",
    description: "Template for preview subnames. {number} is replaced with the PR number.",
  },
  {
    name: "parallel",
    default: "false",
    description: "Enable parallel Bulletin uploads for faster deployments.",
  },
  {
    name: "concurrency",
    default: "1",
    description: "Number of concurrent Bulletin upload threads when parallel is enabled.",
  },
];

const pipelineSteps = [
  {
    title: "setup-cli",
    description:
      "Installs the dotns CLI and configures authentication using the provided mnemonics. Sets up both DotNS and Bulletin environments.",
  },
  {
    title: "bulletin (upload)",
    description:
      "Downloads the build artefact, uploads it to Bulletin storage with optional parallelism, and outputs the IPFS CID.",
  },
  {
    title: "dotns (register + contenthash)",
    description:
      "In preview mode: registers a subname (e.g. pr42.myapp.dot) and sets its content hash. In production mode: updates the content hash on the base domain.",
  },
];
</script>
