<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Guides</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Set Up Your Profile</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Your .dot name can carry more than an address. Text records let you attach your Twitter,
        GitHub, website, and a description &mdash; all stored on-chain, readable by any dApp.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Text Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Text records are key-value pairs stored in the
        <RouterLink
          to="/docs/contracts/content-resolver"
          class="font-mono text-dot-accent hover:text-dot-accent-hover"
          >DotnsContentResolver</RouterLink
        >
        contract. The key is a string like <code class="text-dot-accent">twitter</code> and the
        value is whatever you want to store. Standard keys that dApps recognise:
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Key</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example Value</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Purpose</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="record in textRecords" :key="record.key" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ record.key }}</td>
              <td class="px-4 py-3 text-dot-text-primary text-xs">{{ record.example }}</td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">{{ record.purpose }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Set Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Text records are stored in the
        <RouterLink
          to="/docs/contracts/content-resolver"
          class="font-mono text-dot-accent hover:text-dot-accent-hover"
          >DotnsContentResolver</RouterLink
        >
        contract. Each record is a separate <code>setText</code> transaction. You can set records
        using the CLI, SDK, or the DotNS web interface.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Set Records via CLI</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">dotns store set</span> command writes directly
        to your on-chain Store. The ContentResolver reads from the Store, so the effect is the same.
      </p>
      <DocCodeBlock :code="cliSetRecords" lang="bash" filename="Terminal" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Set Records Programmatically</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Call <span class="font-mono text-dot-accent">setText</span> on the ContentResolver. You need
        the node (namehash of your domain) and the key-value pair.
      </p>
      <DocCodeBlock :code="codeSetRecords" lang="typescript" filename="Set text records" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Verify Your Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Read back any record with <span class="font-mono text-dot-accent">getText</span>. This is a
        read-only call &mdash; no wallet needed.
      </p>
      <DocCallout variant="tip" title="Try it">
        <RouterLink to="/docs/protocol/content" class="text-dot-accent hover:text-dot-accent-hover">
          Read a text record &rarr;
        </RouterLink>
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Set Your Reverse Record</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        A reverse record maps your address back to your .dot name. Without it, dApps can resolve
        <code class="text-dot-accent">alice.dot</code> to your address, but they cannot look up your
        address and find <code class="text-dot-accent">alice.dot</code>. Setting a reverse record
        closes this loop.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        The reverse record is stored in
        <RouterLink
          to="/docs/contracts/reverse-resolver"
          class="font-mono text-dot-accent hover:text-dot-accent-hover"
          >DotnsReverseResolver</RouterLink
        >. You can only set the reverse record for your own address &mdash; nobody else can claim to
        be <code class="text-dot-accent">alice.dot</code> on your behalf.
      </p>
      <DocCodeBlock :code="reverseRecordCode" lang="bash" filename="Terminal" />
      <DocCallout variant="tip" title="One name per address">
        Each address can have exactly one reverse record. If you own multiple .dot names, pick the
        one you want dApps to display as your primary identity.
      </DocCallout>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/guides/your-first-domain"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Your First Domain
      </RouterLink>
      <RouterLink
        to="/docs/guides/host-a-website"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Host a Website &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const textRecords = [
  { key: "twitter", example: "@alice", purpose: "Twitter/X handle" },
  { key: "github", example: "alice", purpose: "GitHub username" },
  { key: "url", example: "https://alice.dev", purpose: "Personal website" },
  { key: "description", example: "Building on Polkadot", purpose: "Short bio" },
  { key: "email", example: "alice@example.com", purpose: "Contact email" },
];

const cliSetRecords = `# Set multiple text records
dotns store set twitter "@alice"
dotns store set github "alice"
dotns store set url "https://alice.dev"
dotns store set description "Building on Polkadot"

# Verify
dotns store get twitter`;

const codeSetRecords = `import { encodeFunctionData, namehash } from "viem";

const node = namehash("alice.dot");

// setText(bytes32 node, string key, string value)
const data = encodeFunctionData({
  abi: contentResolverAbi,
  functionName: "setText",
  args: [node, "twitter", "@alice"],
});

await walletClient.sendTransaction({
  to: CONTENT_RESOLVER_ADDRESS,
  data,
});`;

const reverseRecordCode = `# Set reverse record during registration
dotns register domain --name alice --reverse

# Or set it separately afterwards
dotns lookup set-reverse alice`;
</script>
