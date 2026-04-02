<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Guides</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Host a Website</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Build a static site, upload it to Bulletin or IPFS, set the content hash on your .dot
        domain, and serve it through the dweb gateway. No servers, no hosting bills.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How It Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Your website files live on a content-addressed storage network (Bulletin or IPFS). The
        resulting CID is stored on-chain in the
        <RouterLink
          to="/docs/contracts/content-resolver"
          class="text-dot-accent hover:text-dot-accent-hover"
          >ContentResolver</RouterLink
        >. When someone visits <code class="text-dot-accent">yourname.dot</code>, the dweb-proxy
        looks up the content hash, fetches the files, and serves them.
      </p>
      <div
        class="p-4 border border-dot-border rounded-lg bg-dot-surface text-sm font-mono text-dot-text-secondary space-y-1"
      >
        <p>Build static site &rarr; Upload to Bulletin/IPFS &rarr; Get CID</p>
        <p>Set content hash on .dot domain &rarr; CID stored on-chain</p>
        <p>User visits yourname.dot &rarr; Gateway resolves CID &rarr; Content served</p>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">1. Build Your Site</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Any static site generator works. The output must be a folder of static files (HTML, CSS, JS,
        images). The gateway serves files as-is, so server-side rendering is not supported.
      </p>
      <DocCodeBlock :code="buildExamples" lang="bash" filename="Build examples" />
      <DocCallout variant="tip" title="SPA routing">
        If your site uses client-side routing (React Router, Vue Router), make sure your build
        outputs a fallback <code>index.html</code>. The gateway serves <code>index.html</code> for
        any path that does not match a static file.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">2. Upload to Bulletin</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin is Polkadot's on-chain IPFS block storage. Your files are stored permanently on the
        Bulletin parachain.
      </p>
      <DocCodeBlock :code="uploadCode" lang="bash" filename="Terminal" />
      <p class="text-dot-text-secondary leading-relaxed">
        The <code class="text-dot-accent">--print-contenthash</code> flag outputs the encoded
        content hash ready to be set on-chain. Without it, you get the raw IPFS CID.
      </p>
      <DocCallout variant="info" title="Bulletin authorisation">
        Before your first upload, you need TransactionStorage authorisation on the Bulletin chain.
        Run <code>dotns bulletin authorize</code> with a sudo key. On Paseo, testnet authorisation
        is freely available.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Alternative: Upload to IPFS</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        If you prefer standard IPFS, pin your build directory to any IPFS node or pinning service
        (Pinata, web3.storage, etc.). You get a CID the same way.
      </p>
      <DocCodeBlock :code="ipfsUpload" lang="bash" filename="Terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">3. Set the Content Hash</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The content hash is stored in the
        <RouterLink
          to="/docs/contracts/content-resolver"
          class="font-mono text-dot-accent hover:text-dot-accent-hover"
          >DotnsContentResolver</RouterLink
        >
        contract. It uses the ENS contenthash encoding format:
        <code class="text-dot-accent">0xe301</code> (IPFS namespace prefix) followed by the
        multihash bytes.
      </p>
      <DocCodeBlock :code="setContentHash" lang="bash" filename="Terminal" />
      <p class="text-dot-text-secondary leading-relaxed">
        You can also set it programmatically using viem:
      </p>
      <DocCodeBlock :code="setContentHashCode" lang="typescript" filename="Set content hash" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">4. Access Your Site</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        On Paseo, the dweb gateway serves content at
        <code class="text-dot-accent">yourname.paseo.li</code>. The gateway reads the content hash
        from the ContentResolver, fetches the files from Bulletin/IPFS, and returns them with
        correct MIME types.
      </p>
      <DocCodeBlock
        code="curl -I https://yourname.paseo.li
# X-Content-Location: ipfs://bafybeif...
# X-Content-Storage-Type: bulletin
# Content-Type: text/html"
        lang="bash"
        filename="Verify"
      />
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/dweb/hosting" class="text-dot-accent hover:text-dot-accent-hover">
        Look up a content hash &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Updating Your Site</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Upload the new build, get a new CID, and update the content hash on-chain. Because storage
        is content-addressed, the old version stays available at its CID &mdash; you are only
        changing which version your domain points to. The CLI's
        <code class="text-dot-accent">--no-history</code> flag skips local history tracking if you
        do not need it.
      </p>
      <DocCodeBlock :code="updateCode" lang="bash" filename="Terminal" />
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/guides/set-up-profile"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Set Up Your Profile
      </RouterLink>
      <RouterLink
        to="/docs/guides/deploy-with-ci"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Deploy with CI &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const buildExamples = `# Vite
npm run build   # outputs to ./dist

# Astro
astro build     # outputs to ./dist

# Next.js (static export)
next build && next export   # outputs to ./out`;

const uploadCode = `# Upload your build directory to Bulletin
dotns bulletin upload ./dist --print-contenthash --concurrency 4

# Output:
# Merkleising directory: 42 files (128 KB)
# CID: bafybeif7ztnhq5dtmz3brhb4vkqdmfe...
# Content hash: 0xe3010170122046d...`;

const ipfsUpload = `# Upload to IPFS via CLI (requires an IPFS binary)
ipfs add -r ./dist --cid-version 1

# Or use a pinning service
npx w3 up ./dist

# Tip: \`dotns bulletin upload\` produces the same root CID
# as \`ipfs add\` without requiring a local IPFS installation`;

const setContentHash = `# Set the content hash for your domain
dotns content set yourname bafybeif7ztnhq5dtmz3brhb4vkqdmfe...

# Verify
dotns content view yourname`;

const setContentHashCode = `import { encodeFunctionData, namehash, toHex } from "viem";

const node = namehash("yourname.dot");
const contentHash = "0xe3010170122046d..."; // encoded CID

const data = encodeFunctionData({
  abi: contentResolverAbi,
  functionName: "setContenthash",
  args: [node, contentHash],
});

await walletClient.sendTransaction({
  to: CONTENT_RESOLVER_ADDRESS,
  data,
});`;

const updateCode = `# Rebuild
npm run build

# Re-upload (content-addressable — only changed blocks are new)
dotns bulletin upload ./dist --print-contenthash

# Update the on-chain pointer
dotns content set yourname <new-cid>`;
</script>
