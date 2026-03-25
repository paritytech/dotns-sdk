<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Use Cases</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Wallet &amp; DeFi Integration</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Replace raw addresses with human-readable
        <span class="font-mono text-dot-accent">.dot</span> names in your wallet or DeFi
        application. Resolve names before transactions, display reverse-resolved identities, and
        give your users a Polkadot-native identity layer.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why It Matters</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Ethereum wallets like MetaMask resolve ENS names before every transfer. Uniswap displays ENS
        identities in governance. Aave shows them in dashboards. The same pattern applies here:
        <span class="font-mono text-dot-accent">.dot</span> names give Polkadot users human-readable
        addresses across every touchpoint.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="benefit in benefits"
          :key="benefit.title"
          class="p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <p class="text-sm font-medium text-dot-text-primary">{{ benefit.title }}</p>
          <p class="text-xs text-dot-text-tertiary mt-1">{{ benefit.description }}</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Resolve Before Send</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The most common pattern. A user types
        <span class="font-mono text-dot-accent">alice.dot</span>
        into a send field. Your app resolves it to an address, shows a confirmation, and submits the
        transaction. This is exactly what MetaMask does with ENS &mdash; one resolver call before
        the transfer.
      </p>
      <DocCodeBlock :code="resolveBeforeSendCode" lang="typescript" filename="send-with-dotns.ts" />
      <DocCallout variant="info" title="Namehash encoding">
        The resolver's <span class="font-mono">addr(bytes32 node)</span> function expects a
        <span class="font-mono">namehash</span>. Compute it from the full domain (e.g.
        <span class="font-mono">namehash("alice.dot")</span>). See the
        <RouterLink to="/docs/protocol/resolution" class="text-dot-accent hover:underline"
          >Resolution</RouterLink
        >
        page for details.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Display Identity</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Uniswap's governance page shows ENS names next to voter addresses. You can do the same with
        .dot reverse resolution. Given an address, look up the primary name and display it instead
        of the raw hex.
      </p>
      <DocCodeBlock :code="displayIdentityCode" lang="typescript" filename="display-identity.ts" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">DeFi Dashboard Profile</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Enrich your DeFi dashboard with profile metadata. Read text records (avatar, description,
        social links) to build a profile card for any address that has a .dot name. Think of it as
        an on-chain contact book.
      </p>
      <DocCodeBlock :code="profileCardCode" lang="typescript" filename="profile-card.ts" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Integration Architecture</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The integration sits between your UI layer and the transaction submission layer. No changes
        to your contract interactions &mdash; resolve the name to an address first.
      </p>
      <div class="border border-dot-border rounded-xl overflow-hidden">
        <div
          v-for="(step, i) in archSteps"
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Real-World Parallels</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every major Ethereum wallet and DeFi protocol integrates ENS. Here is how the same patterns
        map to .dot names on Polkadot.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Protocol</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">ENS Pattern</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">
                .dot Equivalent
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="row in comparisons" :key="row.protocol" class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary font-medium">{{ row.protocol }}</td>
              <td class="px-4 py-3 text-dot-text-tertiary">{{ row.ens }}</td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ row.dot }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/introduction" class="text-dot-accent hover:text-dot-accent-hover">
        Resolve a .dot name &rarr;
      </RouterLink>
    </DocCallout>

    <DocCallout variant="tip" title="Full contract reference">
      For the complete resolver API (including multicall for batch reads), see the
      <RouterLink to="/docs/contracts/resolver" class="text-dot-accent hover:text-dot-accent-hover">
        Resolver contract docs </RouterLink
      >.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/use-cases/portfolio-site"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Portfolio Site
      </RouterLink>
      <RouterLink
        to="/docs/guides/your-first-domain"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Your First Domain &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const benefits = [
  {
    title: "No More Hex Addresses",
    description: "Users send to alice.dot instead of 0x4Da0...7a6f. Fewer mistakes, more trust.",
  },
  {
    title: "On-Chain Identity",
    description:
      "Display profile data (avatar, bio, social links) from text records tied to each name.",
  },
  {
    title: "Cross-App Consistency",
    description:
      "The same .dot name resolves identically across every wallet and dApp on Polkadot.",
  },
];

const archSteps = [
  {
    title: "User enters a .dot name",
    description:
      'Your input field accepts both raw addresses and .dot names. Detect names by checking for the ".dot" suffix or non-hex input.',
  },
  {
    title: "Resolve to address",
    description:
      "Call resolveNameToAddress with the bare label. The resolver returns the EVM address or null if unregistered.",
  },
  {
    title: "Show confirmation",
    description:
      "Display both the name and the resolved address so the user can verify before signing.",
  },
  {
    title: "Submit transaction",
    description:
      "Pass the resolved address to your contract call, transfer, or swap function as normal.",
  },
];

const comparisons = [
  {
    protocol: "MetaMask",
    ens: "Resolves .eth in send field",
    dot: "Resolve .dot before transfer",
  },
  {
    protocol: "Uniswap",
    ens: "Shows ENS in governance votes",
    dot: "Show .dot in governance UI",
  },
  {
    protocol: "Aave",
    ens: "ENS names in dashboards",
    dot: "Reverse-resolve addresses in dashboards",
  },
  {
    protocol: "OpenSea",
    ens: "ENS as profile identity",
    dot: "Text records for profile metadata",
  },
  {
    protocol: "Etherscan",
    ens: "ENS labels on explorer",
    dot: "Reverse-resolve in block explorers",
  },
];

const resolveBeforeSendCode = `import { createPublicClient, http, parseEther, namehash } from "viem";

const RESOLVER = "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514";

// User types "alice.dot" into the send field
const input = "alice.dot";
const label = input.replace(/\\.dot$/, ""); // "alice"
const node = namehash(label + ".dot");

// 1. Resolve the name to an address
const resolved = await client.readContract({
  address: RESOLVER,
  abi: resolverAbi,
  functionName: "addr",
  args: [node],
});

if (resolved === "0x0000000000000000000000000000000000000000") {
  throw new Error(\`\${input} is not registered\`);
}

// 2. Show confirmation: "Send 1 PAS to alice.dot (0x4Da0...7a6f)?"
console.log(\`Resolved \${input} → \${resolved}\`);

// 3. Submit the transfer with the resolved address
const tx = await walletClient.sendTransaction({
  to: resolved,
  value: parseEther("1"),
});`;

const displayIdentityCode = `import { namehash, getAddress } from "viem";

const REVERSE_RESOLVER = "0x95D57363B491CF743970c640fe419541386ac8BF";

// Given an address from a governance vote or transaction
const voterAddress = "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f";

// Reverse-resolve to get the primary .dot name
const name = await client.readContract({
  address: REVERSE_RESOLVER,
  abi: reverseResolverAbi,
  functionName: "name",
  args: [voterAddress],
});

// Display in your UI
if (name) {
  // Show: "alice.dot voted Yes"
  console.log(\`\${name}.dot voted Yes\`);
} else {
  // Fallback: show truncated address
  console.log(\`\${voterAddress.slice(0, 6)}...\${voterAddress.slice(-4)} voted Yes\`);
}`;

const profileCardCode = `import { namehash } from "viem";

const RESOLVER = "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514";

// Build a profile card from text records
const label = "alice";
const node = namehash(label + ".dot");

const keys = ["description", "url", "twitter", "github", "email"];
const profile: Record<string, string> = {};

for (const key of keys) {
  const value = await client.readContract({
    address: RESOLVER,
    abi: resolverAbi,
    functionName: "text",
    args: [node, key],
  });
  if (value) profile[key] = value;
}

// Result:
// {
//   description: "Building on Polkadot",
//   url: "https://alice.dotns.dev",
//   twitter: "@alice_dot",
//   github: "alice-dev"
// }`;
</script>
