<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">dot.li</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Publishing for dot.li</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        To make a site reachable through dot.li you upload its build to the Bulletin Chain and set
        the resulting CID as the contenthash on your name. dot.li reads that contenthash on-chain
        during resolution, so once it is set your site is served at
        <span class="font-mono text-dot-accent break-all">name.dot.li</span>.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Upload and Set the Contenthash</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        First upload your built output to the Bulletin Chain and print the contenthash for the root
        CID. Then set that CID on your name, which writes the
        <span class="font-mono text-dot-text-primary">EIP-1577</span> contenthash onto the
        ContentResolver.
      </p>
      <DocCodeBlock :code="publishCommands" lang="bash" filename="publish.sh" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How It Becomes Reachable</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        <span class="font-mono text-dot-text-primary">dotns content set</span> records the CID as
        the contenthash for your name on the ContentResolver. When someone visits
        <span class="font-mono text-dot-accent break-all">name.dot.li</span>, dot.li resolves the
        name, reads that contenthash on-chain, decodes it back to the CID, and fetches the matching
        content from the Bulletin Chain.
      </p>
    </div>

    <DocCallout variant="info" title="Updates follow the contenthash">
      dot.li reads the contenthash from the chain on every resolution. To publish a new version,
      upload the new build and run <span class="font-mono">dotns content set</span> again with the
      new CID &mdash; the update appears once the contenthash is changed on-chain.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Automated Deploys</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The same two steps can run in a continuous-integration pipeline, so each push uploads the
        latest build and updates the contenthash without manual intervention. See
        <RouterLink
          to="/docs/guides/deploy-with-ci"
          class="text-dot-accent hover:text-dot-accent-hover"
        >
          Deploy with CI
        </RouterLink>
        for a full walkthrough.
      </p>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dotli/rendering"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Rendering and Verification
      </RouterLink>
      <RouterLink to="/docs/dotli/bulletin" class="text-dot-accent hover:text-dot-accent-hover">
        Bulletin Chain &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const publishCommands = `# Upload your built site to the Bulletin Chain and print its contenthash
dotns bulletin upload ./dist --print-contenthash

# Set the contenthash on your name (writes the EIP-1577 contenthash on the ContentResolver)
dotns content set <name> <cid>`;
</script>
