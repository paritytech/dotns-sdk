<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Introduction</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Getting Started</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Register your first .dot name in minutes. All you need is a Polkadot-compatible wallet and
        some PAS tokens on the Paseo testnet.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Prerequisites</h2>
      <div class="space-y-3">
        <div class="flex items-start gap-3 p-4 border border-dot-border rounded-lg bg-dot-surface">
          <span
            class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >1</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">Polkadot wallet</p>
            <p class="text-xs text-dot-text-secondary mt-1">
              Install a browser extension wallet that supports Polkadot (e.g. Talisman, SubWallet,
              or Polkadot.js).
            </p>
          </div>
        </div>
        <div class="flex items-start gap-3 p-4 border border-dot-border rounded-lg bg-dot-surface">
          <span
            class="mt-0.5 w-6 h-6 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
            >2</span
          >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">PAS tokens</p>
            <p class="text-xs text-dot-text-secondary mt-1">
              DotNS is deployed on the Paseo testnet. Get free PAS tokens from a faucet to cover
              registration fees and gas.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registration Steps</h2>
      <div class="space-y-2">
        <div
          v-for="(step, i) in steps"
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

    <TryItSection title="Try it — Check name availability">
      <TryCheckAvailability />
    </TryItSection>

    <DocCallout variant="info" title="Commit-reveal pattern">
      DotNS uses a two-step registration process to prevent front-running. First you commit a hidden
      hash of your desired name, wait for the
      <RouterLink
        to="/docs/contracts/controller"
        class="text-dot-accent hover:text-dot-accent-hover"
        ><code>minCommitmentAge</code></RouterLink
      >
      period (currently 6 seconds on Paseo), then reveal and complete the registration. The CLI and
      SDK handle this flow for you.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Next Steps</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RouterLink
          to="/docs/guides/your-first-domain"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent transition-colors"
        >
          <p class="text-sm font-medium text-dot-text-primary">Your First Domain</p>
          <p class="text-xs text-dot-text-tertiary mt-1">
            Step-by-step guide to registering a .dot name
          </p>
        </RouterLink>
        <RouterLink
          to="/docs/protocol/architecture"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent transition-colors"
        >
          <p class="text-sm font-medium text-dot-text-primary">Architecture</p>
          <p class="text-xs text-dot-text-tertiary mt-1">
            Understand the 8 contracts and how they interact
          </p>
        </RouterLink>
        <RouterLink
          to="/docs/tools/cli"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface hover:border-dot-accent transition-colors"
        >
          <p class="text-sm font-medium text-dot-text-primary">Install the CLI</p>
          <p class="text-xs text-dot-text-tertiary mt-1">
            Register and manage names from the command line
          </p>
        </RouterLink>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink to="/docs/why-dotns" class="text-dot-text-tertiary hover:text-dot-text-primary">
        &larr; Why DotNS
      </RouterLink>
      <RouterLink
        to="/docs/protocol/architecture"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Architecture &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import TryItSection from "@/components/docs/TryItSection.vue";
import TryCheckAvailability from "@/components/docs/interactive/TryCheckAvailability.vue";
import DocCallout from "@/components/docs/DocCallout.vue";

const steps = [
  {
    title: "Connect your wallet",
    description:
      "Connect a Polkadot-compatible wallet. Both Substrate and EVM addresses are derived from the same account.",
  },
  {
    title: "Search for a name",
    description:
      "Check if your desired .dot name is available using the CLI, SDK, or web interface.",
  },
  {
    title: "Commit",
    description:
      "Submit a hidden commitment hash. This locks your intent without revealing the name.",
  },
  {
    title: "Wait",
    description: "Wait at least 6 seconds for the commitment to mature on-chain.",
  },
  {
    title: "Register",
    description:
      "Reveal your name and complete registration. Pay the registration fee if applicable.",
  },
  {
    title: "Set up your profile",
    description:
      "Add text records (twitter, github, url) and optionally set a reverse record so your name shows instead of your address.",
  },
];
</script>
