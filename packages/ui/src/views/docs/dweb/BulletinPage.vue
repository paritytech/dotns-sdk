<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Bulletin Chain</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Bulletin is Polkadot's on-chain IPFS block storage &mdash; a parachain purpose-built for
        storing content-addressed data directly on the network. Unlike traditional IPFS pinning,
        content stored on Bulletin is guaranteed to be available as long as the chain is live.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What is Bulletin?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin is a Polkadot system parachain that accepts IPFS-formatted blocks as extrinsics and
        stores them on-chain. Each block is content-addressed &mdash; identified by its CID (Content
        Identifier) &mdash; and can be retrieved by any node connected to the chain.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        This makes Bulletin the ideal storage backend for DotNS websites: content is permanent,
        verifiable, and does not depend on external pinning services or gateways staying online.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Upload Modes</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin supports three upload modes depending on the size and structure of your content.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(mode, i) in uploadModes"
          :key="i"
          class="p-5 bg-dot-surface border-b border-dot-border last:border-b-0"
        >
          <div class="flex items-start gap-4">
            <span
              class="mt-0.5 w-7 h-7 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
              >{{ i + 1 }}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-dot-text-primary font-medium">{{ mode.title }}</p>
              <p class="text-sm text-dot-text-secondary mt-1">{{ mode.description }}</p>
              <p class="text-xs font-mono text-dot-text-tertiary mt-2">{{ mode.sizeHint }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Single Block Upload</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        For files under the block size limit (approximately 256 KB), the entire file is stored as a
        single IPFS block in one extrinsic.
      </p>
      <DocCodeBlock :code="singleBlockCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Chunked DAG-PB Upload</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        For larger files, the content is split into chunks and organized into a DAG-PB (Directed
        Acyclic Graph, Protobuf-encoded) Merkle tree. Each chunk is submitted as a separate
        extrinsic, and the root CID references the complete file.
      </p>
      <DocCodeBlock :code="chunkedCode" lang="bash" filename="terminal" />
      <DocCallout variant="info" title="DAG-PB format">
        DAG-PB is the same format used by IPFS for chunked files. This means content stored on
        Bulletin is fully compatible with the IPFS ecosystem &mdash; the same CID can be used to
        retrieve content from either Bulletin or an IPFS gateway.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Directory Upload</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        For websites and multi-file content, Bulletin supports directory uploads. The CLI packages
        all files into a UnixFS directory structure, uploads each file's blocks, and produces a
        single root CID representing the entire directory.
      </p>
      <DocCodeBlock :code="directoryCode" lang="bash" filename="terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Authorisation Model</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin uses the <span class="font-mono text-dot-accent">TransactionStorage</span>
        pallet for authorisation. Accounts must be
        <span class="text-dot-text-primary font-medium">pre-authorized</span> before they can submit
        storage extrinsics. An authorized entity (currently root/sudo) calls
        <span class="font-mono text-dot-accent">TransactionStorage.authorize_account</span> to grant
        an account permission to store a specific number of bytes. Authorization lasts for a fixed
        period (7 days on Polkadot Bulletin). There are no transaction fees &mdash; the Bulletin
        chain operates with no currency.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Parameter</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="param in authParams" :key="param.name" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ param.name }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ param.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="warning" title="Separate mnemonic">
        Bulletin transactions require a Substrate account (SS58 address), not an EVM account. The
        DotNS CLI and deploy workflow accept a separate
        <span class="font-mono">bulletin-mnemonic</span> secret for this purpose.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">CLI Commands</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The DotNS CLI provides a dedicated <span class="font-mono text-dot-accent">bulletin</span>
        command group for interacting with the Bulletin chain.
      </p>
      <DocCodeBlock :code="cliCommands" lang="bash" filename="terminal" />
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dweb/hosting"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Host a Website
      </RouterLink>
      <RouterLink to="/docs/dweb/gateway" class="text-dot-accent hover:text-dot-accent-hover">
        Gateway &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const uploadModes = [
  {
    title: "Single Block",
    description:
      "For small files under 256 KB. The entire file is stored as a single IPFS block in one transaction.",
    sizeHint: "Best for: individual files, small assets, configuration data",
  },
  {
    title: "Chunked DAG-PB",
    description:
      "For larger files. Content is split into chunks, organized into a DAG-PB Merkle tree, and submitted as multiple transactions.",
    sizeHint: "Best for: large files, images, bundles over 256 KB",
  },
  {
    title: "Directory",
    description:
      "For multi-file content like websites. All files are packaged into a UnixFS directory structure with a single root CID.",
    sizeHint: "Best for: static websites, dApps, multi-file projects",
  },
];

const authParams = [
  {
    name: "account",
    description: "SS58 Substrate account that is authorized to submit storage transactions",
  },
  {
    name: "authorization_period",
    description: "Duration an account's authorization remains valid (7 days on Polkadot Bulletin)",
  },
  {
    name: "max_transaction_size",
    description: "Maximum data size per transaction (8 MB on Polkadot Bulletin)",
  },
  {
    name: "max_block_transactions",
    description: "Maximum number of storage transactions per block (512 on Polkadot Bulletin)",
  },
  {
    name: "retention_period",
    description:
      "Duration data is stored on-chain, configured at the chain level via runtime migration",
  },
];

const singleBlockCode = `# Upload a single small file to Bulletin
dotns bulletin upload ./favicon.ico

# Output:
# Uploaded 1 block (4.2 KB)
# CID: bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenra`;

const chunkedCode = `# Upload a large file (automatically chunked)
dotns bulletin upload ./bundle.js

# Output:
# Splitting into 8 chunks (1.8 MB total)
# Uploading chunk 1/8... done
# Uploading chunk 2/8... done
# ...
# Uploaded 8 blocks + 1 DAG-PB root
# Root CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi`;

const directoryCode = `# Upload an entire directory (website build output)
dotns bulletin upload ./dist

# Output:
# Scanning directory: 24 files (3.4 MB)
# Uploading index.html... done
# Uploading assets/index-DfG3k2.js... done
# Uploading assets/style-xK9m1.css... done
# ...
# Uploaded 42 blocks (3.4 MB)
# Root CID: bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle

# The root CID is a UnixFS directory — set it as your content hash
dotns content set mysite bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle`;

const cliCommands = `# Upload a file or directory to Bulletin
dotns bulletin upload <path>

# Authorize an account for Bulletin storage
dotns bulletin authorize [address]

# View upload history
dotns bulletin history

# Remove a specific entry from upload history
dotns bulletin history:remove <cid>

# Clear all upload history
dotns bulletin history:clear`;
</script>
