<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Store &amp; StoreFactory</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        API reference for the StoreFactory and Store contracts. For the design rationale, ownership
        model, key format, locking semantics, and transfer behaviour, see
        <RouterLink to="/docs/protocol/store" class="text-dot-accent hover:text-dot-accent-hover"
          >On-Chain Storage</RouterLink
        >.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">StoreFactory &mdash; Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0x030296782F4d3046B080BcB017f01837561D9702
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">StoreFactory Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">deploy()</h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Deploys a new Store contract for the caller. Each address can only deploy one Store.
          Reverts if the caller already has a Store.
        </p>
        <DocReturnsTable
          :returns="[
            {
              name: 'store',
              type: 'address',
              description: 'The address of the newly deployed Store contract',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getDeployedStore(who)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the Store contract address deployed for a given user. Returns
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >address(0)</code
          >
          if no Store has been deployed.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'who',
              type: 'address',
              description: 'The user address to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'store',
              type: 'address',
              description: 'Store contract address, or zero address if none deployed',
            },
          ]"
        />
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Store Functions</h2>
      <p class="text-sm text-dot-text-secondary">
        Each Store is an independent contract deployed per user. It provides key-value storage with
        authorisation controls.
      </p>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">getValue(key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the value stored at the given key for the Store owner.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'key',
              type: 'bytes32',
              description: 'The storage key to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'value',
              type: 'bytes',
              description: 'The stored value, or empty bytes if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getValueFor(user, key)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the value stored at the given key for a specific user's namespace within the
          Store.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user whose namespace to read from',
              required: true,
            },
            {
              name: 'key',
              type: 'bytes32',
              description: 'The storage key to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'value',
              type: 'bytes',
              description: 'The stored value, or empty bytes if unset',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setValue(key, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets a key-value pair in the Store. Only callable by the Store owner or an authorised
          address.
        </p>
        <DocParamTable
          :params="[
            { name: 'key', type: 'bytes32', description: 'The storage key', required: true },
            { name: 'value', type: 'bytes', description: 'The value to store', required: true },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The key is locked by the Controller (immutable registration data).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setValueFor(user, key, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets a key-value pair on behalf of another user. Requires authorisation from the Store
          owner.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user whose namespace to write to',
              required: true,
            },
            { name: 'key', type: 'bytes32', description: 'The storage key', required: true },
            { name: 'value', type: 'bytes', description: 'The value to store', required: true },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          Caller is not an authorised Store writer.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">deleteValue(key)</h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Deletes the value at the given key. Only callable by the Store owner or an authorised
          address.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'key',
              type: 'bytes32',
              description: 'The storage key to delete',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The key is locked (immutable registration data cannot be deleted).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            isLocked(user, key)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns whether a specific key is locked (immutable) for the given user. Locked keys
          cannot be modified or deleted.
        </p>
        <DocParamTable
          :params="[
            { name: 'user', type: 'address', description: 'The user address', required: true },
            {
              name: 'key',
              type: 'bytes32',
              description: 'The storage key to check',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'locked', type: 'bool', description: 'True if the key is immutable' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            authoriseStore(addr)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Grants write permission to an address, allowing it to set values in this Store.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'addr',
              type: 'address',
              description: 'The address to authorise',
              required: true,
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            authoriseDotnsController(addr)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Grants the DotNS Controller contract write permission. This is required during
          registration so the Controller can write registration records to the user's Store.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'addr',
              type: 'address',
              description: 'The Controller contract address to authorise',
              required: true,
            },
          ]"
        />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="store.ts" />
    </div>

    <DocCallout variant="info" title="One Store per user">
      Each address can only deploy a single Store contract via the StoreFactory. The Controller
      automatically creates a Store for users during their first registration if one does not
      already exist. Store records written by the Controller during registration are locked and
      cannot be modified.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/pop-rules"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; PoP Rules
      </RouterLink>
      <RouterLink to="/docs/dweb/overview" class="text-dot-accent hover:text-dot-accent-hover">
        dWeb Overview &rarr;
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

const exampleCode = `import { createPublicClient, createWalletClient, custom, defineChain, http, keccak256, toBytes, toHex, fromHex, zeroAddress } from "viem";

// ABI fragments for the functions used in this example
const storeFactoryAbi = [
  {
    type: "function",
    name: "getDeployedStore",
    inputs: [{ name: "who", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deploy",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

const storeAbi = [
  {
    type: "function",
    name: "authoriseDotnsController",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setValue",
    inputs: [
      { name: "key", type: "bytes32" },
      { name: "value", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getValue",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
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

const walletClient = createWalletClient({
  chain: paseoAssetHub,
  transport: custom(window.ethereum),
});

const STORE_FACTORY = "0x030296782F4d3046B080BcB017f01837561D9702";

// Get or deploy a Store
let storeAddress = await client.readContract({
  address: STORE_FACTORY,
  abi: storeFactoryAbi,
  functionName: "getDeployedStore",
  args: [walletClient.account.address],
});

if (storeAddress === zeroAddress) {
  await walletClient.writeContract({
    address: STORE_FACTORY,
    abi: storeFactoryAbi,
    functionName: "deploy",
  });
  storeAddress = await client.readContract({
    address: STORE_FACTORY,
    abi: storeFactoryAbi,
    functionName: "getDeployedStore",
    args: [walletClient.account.address],
  });
}

// Authorise the Controller to write registration records
const CONTROLLER = "0xd09e0F1c1E6CE8Cf40df929ef4FC778629573651";
await walletClient.writeContract({
  address: storeAddress,
  abi: storeAbi,
  functionName: "authoriseDotnsController",
  args: [CONTROLLER],
});

// Write a custom value
const key = keccak256(toBytes("my-custom-key"));
await walletClient.writeContract({
  address: storeAddress,
  abi: storeAbi,
  functionName: "setValue",
  args: [key, toHex("hello world")],
});

// Read it back
const stored = await client.readContract({
  address: storeAddress,
  abi: storeAbi,
  functionName: "getValue",
  args: [key],
});
console.log("Stored value:", fromHex(stored, "string"));`;
</script>
