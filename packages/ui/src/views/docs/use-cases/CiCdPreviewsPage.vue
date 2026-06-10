<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">CI/CD Previews</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Every pull request gets its own live preview at a unique subname like
        <span class="font-mono text-dot-accent">pr42.myapp.dot</span>. When the PR is merged,
        production deploys automatically to
        <span class="font-mono text-dot-accent">myapp.dot</span>. Content-addressable storage means
        identical builds are never uploaded twice.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How It Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The DotNS Deploy Workflow plugs into GitHub Actions. Each pull request triggers a preview
        deploy to a subname. Each merge to main triggers a production deploy to the base domain.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in cicdFlow"
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Preview Deploys</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When a pull request is opened or updated, the workflow builds the project, uploads it to
        Bulletin, creates a subname for the PR, and sets the content hash. Reviewers can visit the
        live preview to test changes before merging.
      </p>
      <DocCodeBlock :code="previewWorkflow" lang="yaml" filename=".github/workflows/preview.yml" />
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">PR</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Preview URL</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="example in previewExamples" :key="example.pr" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ example.pr }}</td>
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ example.url }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Production Deploys</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When a PR is merged to main, the production workflow builds, uploads, and updates the
        content hash on the base domain. The live site is updated within minutes.
      </p>
      <DocCodeBlock
        :code="productionWorkflow"
        lang="yaml"
        filename=".github/workflows/deploy.yml"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Content-Addressable Caching</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Because Bulletin uses content-addressed storage, the same build always produces the same
        CID. The deploy workflow hashes the build output and keys a deployment cache on it, scoped
        to the target environment. When a build matches a previous deploy, the upload and the
        content-hash update are both skipped entirely &mdash; no wasted transactions.
      </p>
      <DocCodeBlock :code="cachingExample" lang="text" filename="cached deploy output" />
      <DocCallout variant="tip" title="Cost savings">
        The deployment cache avoids re-uploading unchanged builds. Rebuilding identical code on a
        re-run, or re-triggering a workflow without source changes, reuses the cached CID and incurs
        no Bulletin transaction costs. Pass
        <span class="font-mono">skip-cache: true</span> to force a fresh upload.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">PR Lifecycle</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Preview subnames persist as long as the content hash is set. Since Bulletin storage is
        permanent, previous previews remain accessible even after the PR is merged or closed.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Event</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="event in lifecycle" :key="event.event" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium text-sm">{{ event.event }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ event.action }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <DocCallout variant="info" title="Full workflow reference">
      For complete documentation on workflow inputs, secrets, and configuration options, see the
      <RouterLink
        to="/docs/guides/deploy-with-ci"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Deploy with CI
      </RouterLink>
      page.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/dapp-hosting"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; dApp Hosting
      </RouterLink>
      <RouterLink
        to="/docs/use-cases/dao-naming"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        DAO Naming &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const cicdFlow = [
  {
    title: "Developer opens a pull request",
    description:
      "The preview workflow is triggered by the pull_request event (opened or synchronize).",
  },
  {
    title: "Workflow builds the project",
    description:
      "Your standard build step runs (npm run build, etc.) to produce a static output directory.",
  },
  {
    title: "Output uploaded to Bulletin",
    description:
      "The build output is uploaded to the Bulletin chain. If an identical build was already deployed for this environment, the deployment cache skips the upload entirely.",
  },
  {
    title: "Preview subname created",
    description:
      "A subname like pr42.myapp.dot is registered and its content hash is set to the new CID.",
  },
  {
    title: "Reviewer visits preview URL",
    description:
      "The PR comment includes a link to the live preview. Reviewers test changes before approving.",
  },
  {
    title: "PR merged to main",
    description:
      "The production workflow triggers, uploads the final build, and updates myapp.dot's content hash.",
  },
];

const previewExamples = [
  { pr: "PR #42 — Add login page", url: "pr42.myapp.dot" },
  { pr: "PR #57 — Update dashboard", url: "pr57.myapp.dot" },
  { pr: "PR #63 — Fix mobile layout", url: "pr63.myapp.dot" },
];

const lifecycle = [
  {
    event: "PR opened",
    action: "Preview subname created, content hash set, comment posted with preview URL.",
  },
  {
    event: "PR updated (new commits)",
    action:
      "Build re-runs, content hash updated on the existing subname. Preview URL stays the same.",
  },
  {
    event: "PR merged",
    action: "Production workflow deploys to the base domain. Preview subname remains accessible.",
  },
  {
    event: "PR closed (not merged)",
    action: "No action. Preview subname and content remain on-chain (content is immutable).",
  },
];

const previewWorkflow = `name: Preview Deploy
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
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
      mode: preview
      artifact-name: build
      subname-format: pr-number
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const productionWorkflow = `name: Production Deploy
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
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
      mode: production
      artifact-name: build
    secrets:
      dotns-mnemonic: \${{ secrets.DOTNS_MNEMONIC }}
      bulletin-mnemonic: \${{ secrets.BULLETIN_MNEMONIC }}`;

const cachingExample = `Hashing build output: 24 files (3.4 MB)
Deployment cache key: deploy-paseo-v2-next-1f3c9ab2

Cache hit — reusing CID: bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle
Skipping Bulletin upload (build unchanged for this environment)
Skipping content-hash update (already current)

Deploy complete in 4s — no transactions submitted`;
</script>
