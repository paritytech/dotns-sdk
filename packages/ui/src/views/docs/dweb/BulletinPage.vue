<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Decentralised Web</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Bulletin Chain</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Bulletin is Polkadot's on-chain IPFS block storage &mdash; a parachain purpose-built for
        storing content-addressed data directly on the network. Unlike traditional IPFS pinning,
        content stored on Bulletin is available as long as the chain is live.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What is Bulletin?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin is a Polkadot system parachain that accepts IPFS-formatted blocks as transactions
        and stores them on-chain. Each block is content-addressed &mdash; identified by its CID
        (Content Identifier) &mdash; and can be retrieved by any node connected to the chain.
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
        For larger files, the content is split into chunks and organised into a DAG-PB Merkle tree
        (a data structure that links chunks together by their hashes). Each chunk is submitted as a
        separate transaction, and the root CID references the complete file.
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
        For websites and multi-file content, the CLI packages all files into a UnixFS directory
        structure and produces a single root CID representing the entire directory. There are two
        approaches: per-block uploads and CAR uploads.
      </p>
      <h3 class="text-lg font-medium text-dot-text-primary">Per-block upload</h3>
      <p class="text-sm text-dot-text-secondary leading-relaxed">
        Each IPFS block is submitted as a separate transaction. This gives fine-grained control but
        is slower for large directories.
      </p>
      <DocCodeBlock :code="directoryCode" lang="bash" filename="terminal" />
      <h3 class="text-lg font-medium text-dot-text-primary">CAR upload (recommended)</h3>
      <p class="text-sm text-dot-text-secondary leading-relaxed">
        Pass <span class="font-mono text-dot-accent">--as-car</span> to merkleise the directory
        in-memory and upload it as a chunked CAR file. This uses
        <span class="font-mono">ipfs-unixfs-importer</span> and
        <span class="font-mono">@ipld/car</span> under the hood and produces the same root CID as
        <span class="font-mono">ipfs add</span>. No external IPFS binary (such as Kubo) is needed.
      </p>
      <DocCodeBlock :code="carUploadCode" lang="bash" filename="terminal" />
      <DocCallout variant="tip" title="When to use --as-car">
        <span class="font-mono">--as-car</span> is recommended for most directory uploads. It is
        significantly faster than per-block uploads and works with
        <span class="font-mono">--concurrency</span>, <span class="font-mono">--resume</span>, and
        <span class="font-mono">--max-retries</span>.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Authorisation Model</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Bulletin uses the <span class="font-mono text-dot-accent">TransactionStorage</span>
        pallet (a Substrate runtime module) for authorisation. Accounts must be
        <span class="text-dot-text-primary font-medium">pre-authorised</span> before they can submit
        storage transactions. A chain administrator calls
        <span class="font-mono text-dot-accent">TransactionStorage.authorize_account</span> to grant
        an account permission to store a specific number of bytes. Authorisation lasts for a fixed
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
      "For larger files. Content is split into chunks, linked together in a Merkle tree, and submitted as multiple transactions.",
    sizeHint: "Best for: large files, images, bundles over 256 KB",
  },
  {
    title: "Directory (per-block)",
    description:
      "For multi-file content such as websites. All files are packaged into a directory structure with a single root CID. Each IPFS block is submitted as a separate transaction.",
    sizeHint: "Best for: small directories, fine-grained control",
  },
  {
    title: "Directory as CAR (--as-car)",
    description:
      "Merkleise directory in-memory and upload as a chunked CAR file. Significantly faster than per-block uploads (~2 min vs ~22 min for 16 MB). Content resolves on IPFS gateways. No external IPFS binary needed.",
    sizeHint: "Best for: static websites, dApps, CI/CD pipelines (recommended)",
  },
];

const authParams = [
  {
    name: "account",
    description:
      "Substrate account (SS58 format) that is authorised to submit storage transactions",
  },
  {
    name: "authorization_period",
    description: "Duration an account's authorisation remains valid (7 days on Polkadot Bulletin)",
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

const carUploadCode = `# Upload an entire directory as a chunked CAR file (recommended)
dotns bulletin upload ./dist --as-car

# Output:
# Merkleising directory: 24 files (3.4 MB)
# Uploading CAR (42 chunks)...
# Uploaded 3.4 MB in 12s
# Root CID: bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle

# Combine with concurrency and resume support
dotns bulletin upload ./dist --as-car --concurrency 4 --resume

# The root CID is identical to what \`ipfs add -r\` would produce
dotns content set mysite bafybeif2uyxcrahg5kkjramreslhmssp4dkexumd7vqp5dmhtrxqjxngle`;

const cliCommands = `# Upload a file or directory to Bulletin
dotns bulletin upload <path>

# Upload a directory as a chunked CAR file (recommended for directories)
dotns bulletin upload <path> --as-car

# Upload and cache the CID in your on-chain Store contract
dotns bulletin upload <path> --as-car --cache

# Authorise an account for Bulletin storage
dotns bulletin authorize [address]

# View upload history
dotns bulletin history

# Remove a specific entry from upload history
dotns bulletin history:remove <cid>

# Clear all upload history
dotns bulletin history:clear`;
</script>
