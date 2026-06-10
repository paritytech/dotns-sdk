<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">PopRules</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        PopRules is the
        <span class="text-dot-text-primary font-medium">name classification and pricing engine</span
        >. It classifies names by stem length and trailing-digit count, sets registration prices
        based on Proof-of-Personhood (PoP) status (an identity check that proves a user is a real
        person), and manages reserved name claims.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x4909bFb3f4Fd86244abD6430fDfA0Ce5C91aD0c4
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
          Classifies a name into a required PoP tier per DotNS naming rules. Callers use the
          returned tier to decide which pricing and verification branch applies.
        </p>
        <DocParamTable :params="classifyParams" />
        <DocReturnsTable
          :returns="[
            {
              name: 'requirement',
              type: 'PopStatus',
              description: 'Required tier for registration',
            },
            {
              name: 'message',
              type: 'string',
              description: 'Explanation of the classification result',
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical, or has exactly one or more than two trailing digits
          (PopError).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            priceWithCheck(name, user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Calculates price with PoP classification and reservation enforcement. This is the
          reverting pricing path used by the commit-reveal controller. Price is a spam deterrent and
          is significant only for NoStatus users; verified users pay zero.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'Domain label', required: true },
            {
              name: 'userAddress',
              type: 'address',
              description: 'Registering user for the given label',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'metadata',
              type: 'PriceWithMeta',
              description:
                'Struct with price (uint256), status (PopStatus), userStatus (PopStatus), message (string). See Type Definitions.',
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical, the base stem is held live by another user, the label is
          governance-reserved, or the user's personhood tier does not meet the label's required tier
          (PopError). Use
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
          Calculates price with PoP classification and reservation metadata, without reverting on
          conflicts. Surfaces the same
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >PriceWithMeta</code
          >
          fields as <code>priceWithCheck</code>, but reports a Reserved status instead of reverting
          when the base stem is held by another user, and does not reject governance-reserved names.
          Front-ends use it to present a price and eligibility preview without forcing a transaction
          attempt.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'Domain label', required: true },
            {
              name: 'userAddress',
              type: 'address',
              description: 'Registering user for the given label',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'metadata',
              type: 'PriceWithMeta',
              description:
                'Struct with price (uint256), status (PopStatus), userStatus (PopStatus), message (string). See Type Definitions.',
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical (PopError). It does not revert on contested or
          governance-reserved labels.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">price(name)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Calculates registration cost for a label. Returns zero for any label shorter than 9
          characters; lengths >= 9 pay the flat startingPrice deposit. Ignores the caller's
          personhood status and reservation state.
        </p>
        <DocParamTable
          :params="[
            { name: 'name', type: 'string', description: 'Domain label to price', required: true },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'cost', type: 'uint256', description: 'Registration cost in wei' }]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical (PopError).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            isBaseNameReserved(baseName)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Indicates whether a base name is currently reserved. Applies the live-window predicate to
          the stored slot, so an expired reservation reads as free.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'baseName',
              type: 'string',
              description: 'The base label without trailing digits',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'reservedStatus',
              type: 'bool',
              description: 'True if a live reservation is active',
            },
            {
              name: 'owner',
              type: 'address',
              description: 'The reservation holder (zero when not reserved)',
            },
            {
              name: 'expires',
              type: 'uint64',
              description: 'UNIX timestamp when the reservation expires',
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
          Creates or refreshes a reservation entry for a PopLite-eligible stem, via the
          commit-reveal reservation path. The caller passes the already-stripped stem; the contract
          enforces stem shape (no trailing digits) and PopLite-eligibility (length 6 to 8). A
          same-user refresh, or a write into an empty or expired slot, succeeds.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'stem',
              type: 'string',
              description: 'The base label with no trailing digits',
              required: true,
            },
            {
              name: 'user',
              type: 'address',
              description: 'The address receiving reservation rights',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller is not an authorised controller on the registrar (NotRegistry), the label is
          non-canonical or outside the PopLite stem shape, or it collides with another user's live
          reservation (PopError).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            reachFee(name, account)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Friction fee owed when an account reaches into a label tier above its verification level.
          Non-zero only when the account cannot meet the label's required PoP tier; the value is the
          flat NoStatus deposit. Acts as cross-payer friction at registration time; use
          <code>transferFloor</code> for transfer-time friction.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'name',
              type: 'string',
              description: 'Domain label being acted on',
              required: true,
            },
            {
              name: 'account',
              type: 'address',
              description: 'Account whose verification reach is being measured',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'fee', type: 'uint256', description: 'Friction fee in wei' }]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical, or has exactly one or more than two trailing digits
          (PopError).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            transferFloor(name, from, to)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Transfer-time friction floor: the greater of the recipient-reach component and the
          sender-tier-downgrade component. Returns the flat NoStatus deposit when either the
          recipient does not meet the label's required tier, or the recipient's personhood tier is
          strictly below the sender's. Returns zero when neither condition holds. Consumed by
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >DotnsRegistrar.quoteTransferFee</code
          >.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'name',
              type: 'string',
              description: 'Domain label being transferred',
              required: true,
            },
            {
              name: 'from',
              type: 'address',
              description: 'Current holder of the name',
              required: true,
            },
            {
              name: 'to',
              type: 'address',
              description: 'Incoming holder of the name',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'floor', type: 'uint256', description: 'Transfer friction floor in wei' },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The label is non-canonical, or has exactly one or more than two trailing digits
          (PopError).
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

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="pop-rules.ts" />
    </div>

    <DocCallout variant="warning" title="PoP-gated tiers">
      Classification reads the stem length (the character count after stripping the trailing
      digits), not the total label length. Names with a stem of 6&ndash;8 characters and exactly two
      trailing digits classify as <strong>PopLite</strong> (gateway-issued). Names with a stem of
      6&ndash;8 characters and no trailing digits require <strong>PopFull</strong> verification.
      Names with a stem of 9 or more characters are <strong>NoStatus</strong>, open to anyone for a
      flat refundable deposit. Names with a stem of 5 or fewer characters are
      <strong>Reserved</strong> (governance only). A label with one trailing digit or more than two
      trailing digits is rejected by the classifier. Use <code>classifyName</code> to check the
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
    description: "The name label being evaluated",
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

const POP_RULES = "0x4909bFb3f4Fd86244abD6430fDfA0Ce5C91aD0c4";

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
