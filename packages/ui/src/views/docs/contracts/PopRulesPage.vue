<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">PopRules</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        PopRules is the
        <span class="text-dot-text-primary font-medium">name classification and pricing engine</span
        >. It classifies names by length and character composition, sets registration prices based
        on Proof-of-Personhood (PoP) status (an identity check that proves a user is a real person),
        and manages reserved name claims.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            classifyName(name)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the classification tier for a name based on its length and character composition.
          Classification determines pricing and availability rules.
        </p>
        <DocParamTable :params="classifyParams" />
        <DocReturnsTable
          :returns="[
            {
              name: 'status',
              type: 'PopStatus',
              description: 'The required PoP tier for this name',
            },
            {
              name: 'message',
              type: 'string',
              description: 'Human-readable classification description',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            priceWithCheck(name, user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the registration price for a name, factoring in the user's PoP status. Reverts if
          the user is not eligible to register the name.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'The name to price', required: true },
            {
              name: 'user',
              type: 'address',
              description: 'The address of the registrant',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'result',
              type: 'PriceWithMeta',
              description:
                'Struct with price (uint256), status (PopStatus), userStatus (PopStatus), message (string). See Type Definitions.',
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller does not meet the name's PoP requirement. Use
          <code>priceWithoutCheck</code> to query pricing without risk of revert.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            priceWithoutCheck(name, user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the registration price and metadata for a name without checking eligibility.
          Returns the same
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >PriceWithMeta</code
          >
          struct as <code>priceWithCheck</code> but never reverts on eligibility.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'The name to price', required: true },
            {
              name: 'user',
              type: 'address',
              description: 'The address of the registrant',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'result',
              type: 'PriceWithMeta',
              description:
                'Struct with price (uint256), status (PopStatus), userStatus (PopStatus), message (string). See Type Definitions.',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">price(name)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the base registration price for a name without any user-specific discounts or PoP
          adjustments.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'The name to price', required: true },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'price', type: 'uint256', description: 'Registration cost in wei' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            userPopStatus(user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the current PoP verification status of a user.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The address to check',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'status', type: 'PopStatus', description: 'Current PoP tier of the user' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            isBaseNameReserved(baseName)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">Returns reservation status for a base name.</p>
        <DocParamTable
          :params="[
            {
              name: 'baseName',
              type: 'string',
              description: 'The base name to check',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'isReserved',
              type: 'bool',
              description: 'Whether the name is currently reserved',
            },
            {
              name: 'reservationOwner',
              type: 'address',
              description: 'Address the name is reserved for',
            },
            {
              name: 'expiryTimestamp',
              type: 'uint64',
              description: 'Unix timestamp when the reservation expires',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            reserveBaseName(name, user)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Reserves a base name for a specific user. The reserved name can then be claimed through
          the Controller's
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >registerReserved</code
          >
          function, skipping the commit-reveal flow.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'The name to reserve', required: true },
            {
              name: 'user',
              type: 'address',
              description: 'The address the name is reserved for',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The name is already reserved, or the caller is not authorised to make reservations.
        </DocCallout>
      </div>
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink
        to="/docs/protocol/proof-of-personhood"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Classify a name &rarr;
      </RouterLink>
    </DocCallout>

    <DocCallout variant="tip" title="Try it">
      <RouterLink
        to="/docs/protocol/proof-of-personhood"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        View the pricing curve &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="pop-rules.ts" />
    </div>

    <DocCallout variant="warning" title="PoP-gated tiers">
      Names with a base length of 6&ndash;8 characters (with 1&ndash;2 trailing digits) require
      <strong>PopLite</strong> verification. Names with 6+ base characters and no trailing digits
      require <strong>PopFull</strong>. Names with 5 or fewer base characters are
      <strong>Reserved</strong> (governance only). Use <code>classifyName</code> to check the
      required tier, and <code>priceWithCheck</code> to verify eligibility before attempting
      registration. Calling <code>register</code> for a PoP-gated name without verification will
      revert.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/content-resolver"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Content Resolver
      </RouterLink>
      <RouterLink to="/docs/contracts/store" class="text-dot-accent hover:text-dot-accent-hover">
        Store &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocParamTable from "@/components/docs/DocParamTable.vue";
import DocReturnsTable from "@/components/docs/DocReturnsTable.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import DocCallout from "@/components/docs/DocCallout.vue";
import DocBadge from "@/components/docs/DocBadge.vue";

const classifyParams = [
  {
    name: "name",
    type: "string",
    description: "The plain-text name to classify (e.g. alice)",
    required: true,
  },
];

const exampleCode = `import { createPublicClient, defineChain, http, formatEther } from "viem";

// ABI fragments for the functions used in this example
const popRulesAbi = [
  {
    type: "function",
    name: "classifyName",
    inputs: [{ name: "name", type: "string" }],
    outputs: [
      { name: "status", type: "uint8" },
      { name: "message", type: "string" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "price",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isBaseNameReserved",
    inputs: [{ name: "baseName", type: "string" }],
    outputs: [
      { name: "isReserved", type: "bool" },
      { name: "reservationOwner", type: "address" },
      { name: "expiryTimestamp", type: "uint64" },
    ],
    stateMutability: "view",
  },
] as const;

const paseoAssetHub = defineChain({
  id: 420420417,
  name: "Paseo AssetHub",
  nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
  },
});

const client = createPublicClient({
  chain: paseoAssetHub,
  transport: http(),
});

const POP_RULES = "0x4e8920B1E69d0cEA9b23CBFC87A17Ee6fE02d2d3";

// Classify a name
const [status, message] = await client.readContract({
  address: POP_RULES,
  abi: popRulesAbi,
  functionName: "classifyName",
  args: ["alice"],
});
console.log("Tier:", status, "-", message);

// Get the base price
const basePrice = await client.readContract({
  address: POP_RULES,
  abi: popRulesAbi,
  functionName: "price",
  args: ["alice"],
});
console.log("Base price:", formatEther(basePrice), "PAS");

// Check if a name is reserved
const [isReserved, owner, expiry] = await client.readContract({
  address: POP_RULES,
  abi: popRulesAbi,
  functionName: "isBaseNameReserved",
  args: ["polkadot"],
});
console.log("Reserved:", isReserved, "by:", owner, "until:", expiry);`;
</script>
