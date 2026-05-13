<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Tools</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">CLI</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The DotNS command-line interface provides full access to the protocol from your terminal.
        Register names, manage content, upload to Bulletin, and configure profiles &mdash; all
        without leaving the command line.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Installation</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Install the CLI globally from the latest release:
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div class="flex border-b border-dot-border bg-dot-surface-secondary">
          <button
            v-for="tab in installTabs"
            :key="tab.id"
            @click="activeInstallTab = tab.id"
            class="px-4 py-2.5 text-sm font-medium transition-colors"
            :class="
              activeInstallTab === tab.id
                ? 'text-dot-accent border-b-2 border-dot-accent bg-dot-surface'
                : 'text-dot-text-tertiary hover:text-dot-text-secondary'
            "
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="p-0">
          <DocCodeBlock
            v-for="tab in installTabs"
            v-show="activeInstallTab === tab.id"
            :key="tab.id"
            :code="tab.code"
            lang="bash"
          />
        </div>
      </div>
      <DocCallout variant="tip" title="Verify installation">
        Run <span class="font-mono">dotns --version</span> to check the installed version.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Authentication</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every command that signs a transaction needs a key. The CLI supports three methods, passed
        as flags or resolved from environment variables. The encrypted keystore is the recommended
        approach for local work.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Method</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Flag</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Env var</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="method in authMethods" :key="method.name" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ method.name }}</td>
              <td class="px-4 py-3 font-mono text-dot-accent text-xs whitespace-nowrap">
                {{ method.flag }}
              </td>
              <td class="px-4 py-3 font-mono text-dot-text-tertiary text-xs whitespace-nowrap">
                {{ method.env }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ method.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCodeBlock :code="authExamples" lang="bash" filename="authentication" />
      <DocCallout variant="info" title="Keystore">
        The <span class="font-mono">auth</span> command group manages the encrypted keystore. Run
        <span class="font-mono">dotns auth set</span> to store a mnemonic or key-uri, then the CLI
        picks it up automatically on every command. No need to pass
        <span class="font-mono">-m</span> or <span class="font-mono">-k</span> each time.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Environment Variables</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Set these to avoid passing flags on every invocation. Flags always override env vars.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Variable</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="env in envVars" :key="env.name" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs whitespace-nowrap">
                {{ env.name }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ env.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Shared Options</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Most commands accept these options for authentication and RPC configuration:
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Flag</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="opt in sharedOptions" :key="opt.flag" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs whitespace-nowrap">
                {{ opt.flag }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ opt.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Command Reference</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The CLI has 9 command groups. Each section below lists every subcommand with its arguments
        and options.
      </p>

      <div
        v-for="group in commandReference"
        :key="group.name"
        class="border border-dot-border rounded-xl overflow-hidden"
      >
        <div class="px-5 py-4 bg-dot-surface-secondary border-b border-dot-border">
          <div class="flex items-center gap-2">
            <span class="font-mono text-dot-accent text-sm font-medium"
              >dotns {{ group.name }}</span
            >
          </div>
          <p class="text-sm text-dot-text-secondary mt-1">{{ group.description }}</p>
        </div>
        <div
          v-for="cmd in group.subcommands"
          :key="cmd.usage"
          class="px-5 py-4 border-b border-dot-border last:border-b-0 bg-dot-surface"
        >
          <p class="font-mono text-sm text-dot-text-primary">{{ cmd.usage }}</p>
          <p class="text-sm text-dot-text-secondary mt-1">{{ cmd.description }}</p>
          <div v-if="cmd.options?.length" class="mt-2 space-y-1">
            <p
              v-for="opt in cmd.options"
              :key="opt.flag"
              class="text-xs text-dot-text-tertiary flex gap-2"
            >
              <span class="font-mono text-dot-text-secondary shrink-0">{{ opt.flag }}</span>
              <span>{{ opt.description }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Quick Reference</h2>
      <DocCodeBlock :code="quickReference" lang="bash" filename="common commands" />
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/dweb/deploy-workflow"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Deploy Workflow
      </RouterLink>
      <RouterLink to="/docs/tools/ui" class="text-dot-accent hover:text-dot-accent-hover">
        Web UI &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const activeInstallTab = ref("npm");

const installTabs = [
  {
    id: "npm",
    label: "npm",
    code: "npm install -g @parity/dotns-cli",
  },
  {
    id: "bun",
    label: "bun",
    code: "bun add -g @parity/dotns-cli",
  },
  {
    id: "yarn",
    label: "yarn",
    code: "yarn global add @parity/dotns-cli",
  },
];

const authMethods = [
  {
    name: "Keystore",
    flag: "--account <name>",
    env: "DOTNS_KEYSTORE_PATH",
    description:
      "Encrypted keystore file managed by dotns auth. The CLI decrypts it at runtime. Recommended for local development.",
  },
  {
    name: "Mnemonic",
    flag: "-m, --mnemonic",
    env: "DOTNS_MNEMONIC",
    description:
      "BIP-39 mnemonic phrase passed directly or read from the env var. Used in CI/CD and scripts.",
  },
  {
    name: "Key URI",
    flag: "-k, --key-uri",
    env: "DOTNS_KEY_URI",
    description:
      "Substrate key URI (e.g. //Alice). For development and testing with well-known accounts.",
  },
];

const envVars = [
  { name: "DOTNS_RPC", description: "WebSocket RPC endpoint for the Polkadot chain" },
  { name: "DOTNS_MNEMONIC", description: "BIP-39 mnemonic phrase" },
  { name: "DOTNS_KEY_URI", description: "Substrate key URI (e.g. //Alice)" },
  { name: "DOTNS_KEYSTORE_PATH", description: "Keystore directory (default: ~/.dotns/keystore/)" },
  { name: "DOTNS_KEYSTORE_PASSWORD", description: "Password for encrypted keystore files" },
  { name: "DOTNS_MIN_BALANCE_PAS", description: "Minimum account balance in PAS before warning" },
];

const sharedOptions = [
  { flag: "--rpc <wsUrl>", description: "WebSocket RPC endpoint (env: DOTNS_RPC)" },
  {
    flag: "--keystore-path <path>",
    description: "Keystore directory (env: DOTNS_KEYSTORE_PATH)",
  },
  {
    flag: "--min-balance <pas>",
    description: "Minimum balance in PAS (env: DOTNS_MIN_BALANCE_PAS)",
  },
  {
    flag: "--account <name>",
    description: "Keystore account name (uses keystore default if omitted)",
  },
  { flag: "--password <pw>", description: "Keystore password (env: DOTNS_KEYSTORE_PASSWORD)" },
  { flag: "-m, --mnemonic <phrase>", description: "BIP-39 mnemonic phrase (env: DOTNS_MNEMONIC)" },
  { flag: "-k, --key-uri <uri>", description: "Substrate key URI (env: DOTNS_KEY_URI)" },
  {
    flag: "--json",
    description: "Output result as JSON and suppress all other output (available on most commands)",
  },
];

interface CmdOption {
  flag: string;
  description: string;
}

interface SubCmd {
  usage: string;
  description: string;
  options?: CmdOption[];
}

interface CmdGroup {
  name: string;
  description: string;
  subcommands: SubCmd[];
}

const commandReference: CmdGroup[] = [
  {
    name: "auth",
    description:
      "Manage the encrypted keystore. Store credentials locally so you don't have to pass -m or -k on every command.",
    subcommands: [
      {
        usage: "auth set",
        description: "Encrypt and store a mnemonic or key-uri into a per-account keystore file.",
        options: [
          { flag: "--account <name>", description: "Account name to store under" },
          { flag: "-m, --mnemonic <phrase>", description: "Mnemonic to store" },
          { flag: "-k, --key-uri <uri>", description: "Key URI to store" },
          { flag: "--password <pw>", description: "Keystore password" },
        ],
      },
      {
        usage: "auth list",
        description:
          "List stored account names. Provide --password to also show auth type (mnemonic or key-uri).",
        options: [{ flag: "--password <pw>", description: "Decrypt to show auth type" }],
      },
      {
        usage: "auth use <account>",
        description: "Set the default keystore account.",
      },
      {
        usage: "auth remove <account>",
        description: "Remove a stored account from the keystore.",
      },
      {
        usage: "auth clear",
        description: "Delete all local keystore accounts and the default pointer.",
      },
    ],
  },
  {
    name: "register",
    description:
      "Register .dot names through the commit-reveal flow. Handles pricing, PoP verification, and optional post-registration transfer.",
    subcommands: [
      {
        usage: "register domain",
        description:
          "Register a new base domain. Runs the full commit-reveal flow: commit, wait, then reveal.",
        options: [
          { flag: "-n, --name <label>", description: "Domain label to register (without .dot)" },
          { flag: "-r, --reverse", description: "Also set as the reverse record" },
          { flag: "-g, --governance", description: "Use the governance registration path" },
          {
            flag: "-o, --owner <address>",
            description: "Owner address (EVM, Substrate, or label)",
          },
          { flag: "--transfer", description: "Transfer domain after registration" },
          {
            flag: "--to <destination>",
            description: "Transfer destination (EVM address, SS58, or domain label)",
          },
        ],
      },
      {
        usage: "register subname",
        description: "Register a subname under an existing domain you own.",
        options: [
          { flag: "-n, --name <label>", description: "Subname label to register (required)" },
          {
            flag: "-p, --parent <label>",
            description: "Parent domain label without .dot (required)",
          },
          {
            flag: "-o, --owner <address>",
            description: "Owner address (EVM, Substrate, or label)",
          },
        ],
      },
    ],
  },
  {
    name: "lookup",
    description:
      "Query domain information. Read-only operations that work with any authentication method.",
    subcommands: [
      {
        usage: "lookup name [label]",
        description: "Full domain lookup: owner, address, content hash, Store data, PoP status.",
        options: [
          {
            flag: "-n, --name <label>",
            description: "Domain label (alternative to positional arg)",
          },
          { flag: "--json", description: "Output as JSON" },
        ],
      },
      {
        usage: "lookup owner-of <label>",
        description: "Show whether a name is registered and who owns it. Alias: oo.",
        options: [{ flag: "--json", description: "Output as JSON" }],
      },
      {
        usage: "lookup transfer [label]",
        description: "Transfer domain ownership to another address or .dot name.",
        options: [
          {
            flag: "-d, --destination <dest>",
            description:
              "Transfer destination: EVM address, SS58 address, or domain label (required)",
          },
          { flag: "--json", description: "Output as JSON" },
        ],
      },
    ],
  },
  {
    name: "content",
    description: "View and set IPFS content hashes on .dot domains for decentralised hosting.",
    subcommands: [
      {
        usage: "content view <name>",
        description: "View the content hash currently set on a domain.",
      },
      {
        usage: "content set <name> <cid>",
        description: "Set an IPFS CID as the content hash on a domain.",
      },
    ],
  },
  {
    name: "text",
    description: "View and set text records on .dot domains.",
    subcommands: [
      {
        usage: "text view <name> <key>",
        description: "View a domain text record. Output can be piped to other commands.",
      },
      {
        usage: "text set <name> <key> [value]",
        description:
          "Set a domain text record. Reads from stdin if value is omitted, allowing piped input.",
      },
    ],
  },
  {
    name: "pop",
    description: "Read ProofOfPersonhood status from the personhood precompile.",
    subcommands: [
      {
        usage: "pop status",
        description:
          "Display your current PoP status, including Substrate address and EVM address.",
      },
    ],
  },
  {
    name: "bulletin",
    description: "Upload content to the Bulletin chain and manage upload history.",
    subcommands: [
      {
        usage: "bulletin authorize [address]",
        description:
          "Authorise an account for Bulletin TransactionStorage. Resolves address from keystore if omitted.",
        options: [
          {
            flag: "--bulletin-rpc <wsUrl>",
            description: 'Bulletin RPC endpoint (default: "wss://paseo-bulletin-rpc.polkadot.io")',
          },
          {
            flag: "--transactions <count>",
            description: "Number of transactions to authorise (default: 1,000,000)",
          },
          {
            flag: "--bytes <count>",
            description: "Number of bytes to authorise (default: 1 GB)",
          },
          {
            flag: "--force",
            description: "Force re-authorisation even if account appears already authorised",
          },
        ],
      },
      {
        usage: "bulletin upload <path>",
        description:
          "Upload a file or directory to Bulletin and print the CID. Handles chunking, DAG construction, and directory layouts.",
        options: [
          {
            flag: "--bulletin-rpc <wsUrl>",
            description: "Bulletin RPC endpoint",
          },
          {
            flag: "--cache",
            description:
              "Write the uploaded CID to the user's on-chain Store contract after upload",
          },
          {
            flag: "--chunk-size <bytes>",
            description: "Chunk size for large uploads (default: 2 MB, clamped to 256 KB–2 MB)",
          },
          { flag: "--force-chunked", description: "Force chunked upload (DAG-PB)" },
          {
            flag: "--concurrency <n>",
            description: "Adaptive scheduler max window (default: 4, max: 4)",
          },
          {
            flag: "--max-retries <n>",
            description: "Retry transient upload failures (default: 5, capped at 20)",
          },
          {
            flag: "--resume",
            description: "Resume a previously interrupted chunked upload",
          },
          {
            flag: "--print-contenthash",
            description: "Also print the 0x-prefixed IPFS contenthash encoding",
          },
          { flag: "--no-history", description: "Do not save upload to local history" },
          {
            flag: "--profile-upload",
            description: "Enable upload profiling and write a JSON report",
          },
          {
            flag: "--profile-output <path>",
            description: "Path to write upload profiling JSON report",
          },
          { flag: "--json", description: "Output result as JSON" },
        ],
      },
      {
        usage: "bulletin status [address]",
        description:
          "Check authorisation status for an account on Bulletin. Shows remaining transactions, bytes, and expiry.",
        options: [
          {
            flag: "--bulletin-rpc <wsUrl>",
            description: "Bulletin RPC endpoint",
          },
          { flag: "--json", description: "Output as JSON" },
        ],
      },
      {
        usage: "bulletin verify <cid>",
        description:
          "Verify a CID is resolvable via IPFS gateways. Checks multiple gateways and reports which ones resolve.",
        options: [{ flag: "--json", description: "Output as JSON" }],
      },
      {
        usage: "bulletin history",
        description: "List all uploaded CIDs from local history. Alias: list.",
        options: [{ flag: "--json", description: "Output as JSON" }],
      },
      {
        usage: "bulletin history:remove <cid>",
        description: "Remove a single upload from local history by CID.",
      },
      {
        usage: "bulletin history:clear",
        description: "Clear all upload history.",
      },
    ],
  },
  {
    name: "account",
    description:
      "Account utilities: print addresses, check balances, map Substrate to EVM, and manage whitelist status.",
    subcommands: [
      {
        usage: "account address",
        description:
          "Print the Substrate address for the configured account. Runs offline (no RPC needed).",
      },
      {
        usage: "account info",
        description: "Display account information including Substrate and EVM balances.",
      },
      {
        usage: "account map",
        description:
          "Map a Substrate account to its EVM address. Submits the mapping transaction if not already mapped.",
      },
      {
        usage: "account is-mapped <address>",
        description: "Check if a Substrate or EVM address is mapped on-chain. Alias: is.",
      },
      {
        usage: "account is-whitelisted <address>",
        description: "Check if an address is whitelisted on the DotNS Controller. Alias: iw.",
      },
      {
        usage: "account whitelist <address>",
        description: "Whitelist an address on the DotNS Controller. Admin only.",
      },
    ],
  },
  {
    name: "store",
    description:
      "Manage your on-chain Store: read and write key-value pairs, control write access, and authorise DotNS system contracts.",
    subcommands: [
      {
        usage: "store info",
        description: "Show your Store contract address and deployment status.",
      },
      {
        usage: "store list",
        description: "List all key-value pairs in your Store.",
      },
      {
        usage: "store get <key>",
        description:
          "Get a value by key. Accepts a hex bytes32 key or a string (hashed via keccak256).",
      },
      {
        usage: "store set <key> <value>",
        description: "Set a key-value pair in your Store.",
      },
      {
        usage: "store delete <key>",
        description: "Delete a value from your Store by key.",
      },
      {
        usage: "store check <address>",
        description:
          "Check whether an EVM address is authorised as a writer or DotNS controller on your Store.",
      },
      {
        usage: "store authorize <address>",
        description: "Authorise an EVM address to write to your Store (grants setValueFor access).",
      },
      {
        usage: "store unauthorize <address>",
        description: "Revoke write access from an address on your Store.",
      },
      {
        usage: "store authorize-controller <address>",
        description:
          "Authorise an address as a DotNS controller. Controllers lock keys permanently on write.",
      },
      {
        usage: "store unauthorize-controller <address>",
        description: "Revoke DotNS controller authorisation from an address.",
      },
      {
        usage: "store ensure-auth",
        description:
          "Grant the DotNS system contracts writer and controller access on your Store. Idempotent — safe to run multiple times.",
      },
      {
        usage: "store names",
        description: "List all .dot names held in your Store.",
        options: [{ flag: "--json", description: "Output as JSON" }],
      },
      {
        usage: "store cids",
        description: "List all uploaded CIDs held in your Store.",
        options: [{ flag: "--json", description: "Output as JSON" }],
      },
    ],
  },
];

const authExamples = `# Store a mnemonic in the encrypted keystore (recommended)
dotns auth set -m "word1 word2 word3 ... word12"

# All future commands use the keystore automatically
dotns register domain --name myname

# Or pass a mnemonic directly (CI/CD)
dotns register domain --name myname -m "word1 word2 ..."

# Or use the env var
export DOTNS_MNEMONIC="word1 word2 word3 ... word12"
dotns register domain --name myname

# Key URI for dev/test
dotns lookup name alice -k "//Alice"`;

const quickReference = `# Register a new .dot name
dotns register domain --name myname

# Register a subname
dotns register subname --name blog --parent myname

# Look up who owns a name
dotns lookup owner-of alice

# Full domain info (owner, content hash, store, PoP)
dotns lookup name alice

# Transfer a domain
dotns lookup transfer myname -d 0x1234...abcd

# View a content hash
dotns content view mysite

# Set a content hash
dotns content set mysite bafybei...

# View a text record
dotns text view alice email

# Set a text record
dotns text set alice email "alice@example.com"

# Upload to Bulletin
dotns bulletin upload ./dist

# Upload a directory with concurrency
dotns bulletin upload ./dist --concurrency 4

# Upload and cache the CID in your on-chain Store contract
dotns bulletin upload ./dist --cache

# Resume an interrupted upload
dotns bulletin upload ./dist --resume

# Verify a CID resolves on IPFS
dotns bulletin verify bafkrei...

# Check Bulletin authorisation status
dotns bulletin status

# Authorise an account for Bulletin uploads
dotns bulletin authorize 5DtFfW...

# Check your account balances
dotns account info

# Map Substrate → EVM
dotns account map

# Check if an address is mapped
dotns account is-mapped 5DtFfW...

# Check PoP status
dotns pop status

# Store: write a key-value pair
dotns store set my-key "my-value"

# Store: list all .dot names
dotns store names

# Store: list all uploaded CIDs
dotns store cids

# Store: authorise DotNS system contracts
dotns store ensure-auth

# JSON output (pipe to jq)
dotns lookup name alice --json | jq .`;
</script>
