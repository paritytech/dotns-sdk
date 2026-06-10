<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">dot.li</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">How Resolution Works</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        dot.li resolves a <span class="font-mono text-dot-accent">.dot</span> name entirely on the
        client. An in-browser <span class="text-dot-text-primary font-medium">smoldot</span> light
        client connects to Asset Hub Paseo and queries the dotNS contracts through the Revive EVM
        pallet using read-only dry-runs &mdash; so there is no RPC server in the resolution path.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The Light Client</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Resolution begins with smoldot syncing Asset Hub Paseo directly in the browser. dotNS lives
        on the chain as Solidity contracts behind the
        <span class="font-mono text-dot-text-primary">pallet-revive</span> EVM layer, so dot.li
        reads them through
        <span class="text-dot-text-primary font-medium">read-only dry-runs</span>: it submits the
        contract call as a simulated execution and reads back the returned value without ever
        broadcasting a transaction. Because the light client verifies the chain state itself, the
        answer is trustless and needs no intermediary RPC node.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Resolution Flow</h2>
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

    <DocCallout variant="info" title="Read-only by design">
      Both <span class="font-mono">recordExists(node)</span> on the Registry and
      <span class="font-mono">contenthash(node)</span> on the ContentResolver are read-only calls.
      dot.li runs them as dry-runs through smoldot, so resolution costs no gas and never alters
      on-chain state.
    </DocCallout>

    <DocCallout variant="tip" title="Where the CID lives">
      A name resolves to an IPFS CID stored as an
      <span class="font-mono">EIP-1577</span> contenthash on the ContentResolver. Decoding those
      bytes yields the CID that dot.li then fetches and renders. See
      <RouterLink to="/docs/dotli/rendering" class="text-dot-accent hover:text-dot-accent-hover">
        Rendering and Verification
      </RouterLink>
      for how that content is loaded.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dotli/overview"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; The dot.li Browser
      </RouterLink>
      <RouterLink to="/docs/dotli/rendering" class="text-dot-accent hover:text-dot-accent-hover">
        Rendering and Verification &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";

const flowSteps = [
  {
    title: "Parse the label from the URL",
    description:
      "Read the application label from the subdomain (name.dot.li -> name) or from the path (dot.li/name.dot -> name).",
  },
  {
    title: "Compute the namehash",
    description:
      "Compute the ENS-style namehash of name.dot to obtain the node that identifies the name in dotNS.",
  },
  {
    title: "Call recordExists(node) on the Registry",
    description:
      "Confirm via a read-only dry-run that a record exists for the node on the dotNS Registry contract.",
  },
  {
    title: "Call contenthash(node) on the ContentResolver",
    description:
      "Read the EIP-1577 contenthash bytes set for the node on the dotNS ContentResolver contract.",
  },
  {
    title: "Decode the contenthash to a CID",
    description:
      "Decode the contenthash bytes into an IPFS CID that identifies the content for the name.",
  },
  {
    title: "Create an iframe to cid.app.dot.li",
    description:
      "Open an iframe to the CID subdomain, which fetches the content from the Bulletin Chain or a gateway and renders it.",
  },
];
</script>
