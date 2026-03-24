<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Gateway</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">dweb-proxy-api</span> is the HTTP gateway that
        connects standard browsers to the decentralised web. It receives requests, resolves .dot
        names on-chain, fetches content from decentralised storage, and serves it to the user
        &mdash; all without any extra browser setup.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How It Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When a request arrives at the gateway, it follows a fixed resolution sequence. The gateway
        reads the domain name from the HTTP Host header, queries the DotNS contracts for the content
        hash, and fetches the matching content from the right storage backend.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in resolutionSteps"
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Request Flow</h2>
      <DocCodeBlock :code="requestFlowCode" lang="bash" filename="example request" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Response Headers</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The gateway adds custom response headers with details about the resolution and content
        source. These help with debugging and verifying content integrity.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Header</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="header in responseHeaders" :key="header.name" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs whitespace-nowrap">
                {{ header.name }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ header.description }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-tertiary text-xs">
                {{ header.example }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Supported Protocols</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The gateway reads the prefix of the content hash to work out which storage protocol to use.
        The following protocols are supported:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="protocol in protocols"
          :key="protocol.name"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div class="flex items-center gap-2 mb-1">
            <span class="font-mono text-dot-accent text-xs">{{ protocol.prefix }}</span>
            <span class="text-sm font-medium text-dot-text-primary">{{ protocol.name }}</span>
          </div>
          <p class="text-xs text-dot-text-tertiary">{{ protocol.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Path Resolution</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The gateway supports path resolution within content-addressed directories. When a request
        includes a path (e.g., <span class="font-mono text-dot-accent">/about</span>), the gateway
        walks through the directory structure to find the matching file.
      </p>
      <DocCodeBlock :code="pathResolutionCode" lang="bash" filename="path resolution examples" />
      <DocCallout variant="info" title="Fallback behaviour">
        If a path does not match an exact file, the gateway looks for
        <span class="font-mono">index.html</span> in the directory. If the root directory has an
        <span class="font-mono">index.html</span>, it is served as the fallback for all unmatched
        paths &mdash; ideal for single-page applications.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Caching</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Because content is addressed by hash, the gateway can cache freely. Once a CID is fetched,
        the response can be cached forever &mdash; the content for a given hash never changes. Only
        the name-to-hash lookup needs to be refreshed periodically.
      </p>
      <DocCodeBlock :code="cachingCode" lang="text" filename="cache behaviour" />
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/dweb/hosting" class="text-dot-accent hover:text-dot-accent-hover">
        Look up a content hash &rarr;
      </RouterLink>
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dweb/bulletin"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Bulletin Chain
      </RouterLink>
      <RouterLink
        to="/docs/dweb/deploy-workflow"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Deploy Workflow &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const resolutionSteps = [
  {
    title: "HTTP Request Received",
    description:
      "The gateway receives an HTTP request and extracts the domain name from the Host header (e.g., Host: alice.dot).",
  },
  {
    title: "On-chain Content Hash Lookup",
    description:
      "The gateway computes the namehash for the domain and calls contenthash() on the DotNS ContentResolver contract.",
  },
  {
    title: "Protocol Detection",
    description:
      "The prefix of the content hash identifies the storage protocol: IPFS (0xe3), IPNS (0xe5), Bulletin, Arweave (0x0b), or Swarm (0xe4).",
  },
  {
    title: "Content Fetch",
    description:
      "The gateway fetches the content from the appropriate storage backend using the decoded CID or identifier.",
  },
  {
    title: "Response Served",
    description:
      "The fetched content is returned to the browser with appropriate MIME types and custom X-Content headers for debugging.",
  },
];

const responseHeaders = [
  {
    name: "X-Content-Location",
    description: "The full content address (protocol + CID) of the resolved content",
    example: "ipfs://bafybei...xyz",
  },
  {
    name: "X-Content-Path",
    description: "The resolved path within the content-addressed directory",
    example: "/index.html",
  },
  {
    name: "X-Content-Storage-Type",
    description: "The storage backend used to fetch the content",
    example: "bulletin",
  },
];

const protocols = [
  {
    name: "IPFS",
    prefix: "0xe3 / ipfs://",
    description:
      "Content-addressed storage via the InterPlanetary File System. The most widely used protocol.",
  },
  {
    name: "IPNS",
    prefix: "0xe5 / ipns://",
    description:
      "Mutable pointers to IPFS content, so you can update what a name points to without changing the on-chain record.",
  },
  {
    name: "Bulletin",
    prefix: "bulletin://",
    description:
      "Polkadot's on-chain IPFS block storage. Content is fetched directly from the Bulletin parachain.",
  },
  {
    name: "Arweave",
    prefix: "0x0b / ar://",
    description: "Permanent storage on the Arweave network. Pay once, store forever.",
  },
  {
    name: "Swarm",
    prefix: "0xe4 / bzz://",
    description:
      "Ethereum Swarm decentralised storage. Supported for cross-ecosystem compatibility.",
  },
];

const requestFlowCode = `# Request to the gateway
curl -v -H "Host: alice.dot" https://gateway.dotns.dev/about

# Response headers include:
# < HTTP/2 200
# < content-type: text/html
# < x-content-location: ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
# < x-content-path: /about/index.html
# < x-content-storage-type: bulletin
# < cache-control: public, max-age=31536000, immutable`;

const pathResolutionCode = `# Root path -> serves /index.html from the content directory
GET /  Host: mysite.dot  ->  /index.html

# Static asset -> exact file match
GET /assets/style.css  Host: mysite.dot  ->  /assets/style.css

# Subpath -> looks for /about/index.html, then falls back to /index.html
GET /about  Host: mysite.dot  ->  /about/index.html (or /index.html for SPAs)

# Subname resolution -> blog.mysite.dot has its own content hash
GET /  Host: blog.mysite.dot  ->  resolves blog.mysite.dot separately`;

const cachingCode = `Content-addressed responses (CID-based):
  Cache-Control: public, max-age=31536000, immutable
  → Cached indefinitely. The content for a given CID never changes.

Name resolution (domain → CID mapping):
  Cache-Control: public, max-age=300
  → Refreshed every 5 minutes to pick up content hash updates.

404 / Error responses:
  Cache-Control: no-cache
  → Not cached. Retried on every request.`;
</script>
