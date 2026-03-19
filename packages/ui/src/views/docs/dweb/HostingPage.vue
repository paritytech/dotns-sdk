<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Host a Website</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Deploy a static website to your <span class="font-mono text-dot-accent">.dot</span> domain
        in four steps: build, upload, set the content hash, and access it through the gateway. No
        server configuration, no DNS propagation, no downtime.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployment Steps</h2>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in steps"
          :key="i"
          class="p-5 bg-dot-surface border-b border-dot-border last:border-b-0"
        >
          <div class="flex items-start gap-4">
            <span
              class="mt-0.5 w-7 h-7 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
              >{{ i + 1 }}</span
            >
            <div class="min-w-0 flex-1 space-y-2">
              <p class="text-dot-text-primary font-medium">{{ step.title }}</p>
              <p class="text-sm text-dot-text-secondary">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Step 1: Build Your Static Site</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Any static site generator works &mdash; Vite, Next.js (static export), Hugo, Astro, or plain
        HTML. The output should be a directory of static files with an
        <span class="font-mono text-dot-accent">index.html</span> at the root.
      </p>
      <DocCodeBlock :code="buildCode" lang="bash" filename="terminal" />
      <DocCallout variant="info" title="Single-page apps">
        For SPAs with client-side routing, make sure your build outputs a single
        <span class="font-mono">index.html</span> that handles all routes. The gateway serves this
        file for any path that does not match a static asset.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">
        Step 2: Upload to Bulletin or IPFS
      </h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Upload your build output to a decentralised storage backend. Bulletin is the recommended
        choice for Polkadot-native hosting, as content is stored directly on-chain and is always
        available.
      </p>
      <DocCodeBlock :code="uploadBulletinCode" lang="bash" filename="upload via CLI (Bulletin)" />
      <DocCodeBlock :code="uploadIpfsCode" lang="bash" filename="upload via CLI (IPFS)" />
      <DocCallout variant="tip" title="Bulletin vs IPFS">
        Bulletin stores content on Polkadot's parachain &mdash; it is always available without
        relying on pinning services. IPFS is a good choice if you already have pinning
        infrastructure or want compatibility with the broader IPFS ecosystem.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Step 3: Set the Content Hash</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        After uploading, set the resulting content hash on your .dot name using the CLI or a
        contract call. This links your domain to the uploaded content.
      </p>
      <DocCodeBlock :code="setContentHashCode" lang="bash" filename="terminal" />
      <p class="text-dot-text-secondary leading-relaxed">
        Or set it programmatically via the ContentResolver contract:
      </p>
      <DocCodeBlock
        :code="setContentHashSolidity"
        lang="solidity"
        filename="DotnsContentResolver.sol"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Step 4: Access via Gateway</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Once the content hash is set, your website is live. Access it through the DotNS gateway,
        which resolves the name and fetches the content transparently.
      </p>
      <DocCodeBlock :code="accessCode" lang="bash" filename="terminal" />
      <DocCallout variant="info" title="Gateway URL">
        On the Paseo testnet, the gateway is available at
        <span class="font-mono">https://yourname.dotns.paseo.li</span>. On mainnet, the gateway will
        resolve <span class="font-mono">yourname.dot</span> directly.
      </DocCallout>
    </div>

    <TryItSection title="Try it — Look up a content hash">
      <TryContentHash />
    </TryItSection>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dweb/overview"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Overview
      </RouterLink>
      <RouterLink to="/docs/dweb/bulletin" class="text-dot-accent hover:text-dot-accent-hover">
        Bulletin Chain &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryContentHash from "@/components/docs/interactive/TryContentHash.vue";

const steps = [
  {
    title: "Build your static site",
    description:
      "Use any static site generator to produce an output directory of HTML, CSS, and JS files.",
  },
  {
    title: "Upload to Bulletin or IPFS",
    description:
      "Push your build output to decentralised storage and receive a content hash (CID).",
  },
  {
    title: "Set the content hash",
    description:
      "Link your .dot name to the content hash by calling setContenthash on the ContentResolver.",
  },
  {
    title: "Access via gateway",
    description:
      "Visit your domain through the DotNS gateway. The proxy resolves your name and serves the content.",
  },
];

const buildCode = `# Build with any static site generator
npm run build

# Output directory typically: dist/ or build/
ls dist/
# index.html  assets/  favicon.ico`;

const uploadBulletinCode = `# Upload a directory to Bulletin chain
dotns bulletin upload ./dist

# Output:
# Uploaded 42 blocks (1.2 MB)
# Root CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi`;

const uploadIpfsCode = `# Upload to IPFS (requires an IPFS node or pinning service)
ipfs add -r ./dist --cid-version 1

# Then set the resulting CID as your content hash
dotns content set mysite <cid-from-ipfs>`;

const setContentHashCode = `# Set the content hash on your .dot name
dotns content set mysite bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi

# Verify it was set
dotns content view mysite`;

const setContentHashSolidity = `// Set content hash via the ContentResolver contract
bytes memory ipfsHash = hex"e30101701220..."; // multicodec-encoded CID
contentResolver.setContenthash(node, ipfsHash);

// Read it back
bytes memory hash = contentResolver.contenthash(node);`;

const accessCode = `# Access your site through the gateway
curl -H "Host: mysite.dot" https://gateway.dotns.dev

# Or simply open in a browser:
# https://mysite.dotns.paseo.li  (testnet)
# https://mysite.dot             (mainnet, via gateway)`;
</script>
