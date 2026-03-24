<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsRegistrarController</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Controller runs the
        <span class="text-dot-text-primary font-medium">commit-reveal registration flow</span>,
        enforces pricing rules, and checks proof-of-personhood status. This is the main entry point
        for registering new .dot names.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">available(label)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Checks whether a label is available for registration. Validates the label format and
          checks the Registrar.
        </p>
        <DocParamTable :params="availableParams" />
        <DocReturnsTable
          :returns="[
            { name: 'available', type: 'bool', description: 'True if the label can be registered' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            makeCommitment(registration)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Computes the commitment hash for a registration. Call this first to get the hash you will
          submit in the commit step.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'registration',
              type: 'Registration',
              description:
                'Struct with label (string), owner (address), secret (bytes32), reserved (bool). See Type Definitions.',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'commitment',
              type: 'bytes32',
              description: 'The commitment hash to submit in the commit step',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            commit(commitment)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Submits a commitment hash on-chain. Once the minimum waiting period has passed, you can
          call
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >register</code
          >
          to complete the registration.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'commitment',
              type: 'bytes32',
              description: 'The commitment hash from makeCommitment()',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The commitment hash has already been submitted (duplicate commitment).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            register(registration)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Completes the registration by revealing the commitment. Must be called after
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >minCommitmentAge</code
          >
          and before
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >maxCommitmentAge</code
          >
          has elapsed since the commit. This function is payable &mdash; send the registration fee
          as
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >msg.value</code
          >.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'registration',
              type: 'Registration',
              description:
                'Struct with label (string), owner (address), secret (bytes32), reserved (bool). See Type Definitions.',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Commitment not found, called before <code>minCommitmentAge</code>, called after
          <code>maxCommitmentAge</code>, insufficient <code>msg.value</code>, name not available, or
          caller fails the PoP eligibility check.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            registerReserved(registration)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Registers a reserved name. Only callable by the user who holds the reservation via
          PopRules. Skips the commit-reveal flow.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'registration',
              type: 'Registration',
              description:
                'Struct with label (string), owner (address), secret (bytes32), reserved (bool). See Type Definitions.',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Name is not reserved for the caller, or the reservation has expired.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            minCommitmentAge()
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the minimum number of seconds that must pass between a commit and the
          corresponding register call.
        </p>
        <DocReturnsTable
          :returns="[{ name: 'age', type: 'uint256', description: 'Minimum wait time in seconds' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            maxCommitmentAge()
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the maximum number of seconds after which a commitment expires and can no longer
          be used to register.
        </p>
        <DocReturnsTable
          :returns="[
            {
              name: 'age',
              type: 'uint256',
              description: 'Maximum wait time in seconds before commitment expires',
            },
          ]"
        />
      </div>
    </div>

    <DocCallout variant="tip" title="Try it">
      <RouterLink to="/docs/getting-started" class="text-dot-accent hover:text-dot-accent-hover">
        Check name availability &rarr;
      </RouterLink>
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="register.ts" />
    </div>

    <DocCallout variant="warning" title="Commit-reveal timing">
      The register transaction must be submitted after <code>minCommitmentAge</code> seconds and
      before <code>maxCommitmentAge</code> seconds have elapsed since the commit. Submitting too
      early or too late will cause the transaction to revert.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/registrar"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Registrar
      </RouterLink>
      <RouterLink to="/docs/contracts/resolver" class="text-dot-accent hover:text-dot-accent-hover">
        Resolver &rarr;
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

const availableParams = [
  {
    name: "label",
    type: "string",
    description: "The plain-text label to check (e.g. alice)",
    required: true,
  },
];

const exampleCode = `import { createPublicClient, createWalletClient, custom, defineChain, http, toHex } from "viem";

// ABI fragments for the functions used in this example
const controllerAbi = [
  {
    type: "function",
    name: "available",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "makeCommitment",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "secret", type: "bytes32" },
          { name: "reserved", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commit",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "register",
    inputs: [
      {
        name: "registration",
        type: "tuple",
        components: [
          { name: "label", type: "string" },
          { name: "owner", type: "address" },
          { name: "secret", type: "bytes32" },
          { name: "reserved", type: "bool" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
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

// For write operations, create a wallet client:
const walletClient = createWalletClient({
  chain: paseoAssetHub,
  transport: custom(window.ethereum),
});

const CONTROLLER = "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651";

// Step 1: Check availability
const isAvailable = await client.readContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "available",
  args: ["alice"],
});

// Step 2: Build the registration struct
const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
const registration = {
  label: "alice",
  owner: walletClient.account.address,
  secret,
  reserved: false,
};

// Step 3: Make commitment and submit
const commitment = await client.readContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "makeCommitment",
  args: [registration],
});

await walletClient.writeContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "commit",
  args: [commitment],
});

// Step 4: Wait for minCommitmentAge, then register
await walletClient.writeContract({
  address: CONTROLLER,
  abi: controllerAbi,
  functionName: "register",
  args: [registration],
  value: price, // from PopRules priceWithoutCheck()
});`;
</script>
