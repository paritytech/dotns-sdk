<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Store &amp; StoreFactory</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        API reference for the StoreFactory and the two per-account store contracts it manages: the
        UserStore (your custom key/value data) and the LabelStore (the .dot names you hold). For the
        design rationale, ownership model, key format, and locking semantics, see
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
          0x692047C1477a017F287488E1c85F96Ca28C23fD8
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">StoreFactory Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">claimUserStore()</h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Claims a Store contract for the caller. Each address can only claim one Store. Reverts if
          the caller already has a Store.
        </p>
        <DocReturnsTable
          :returns="[
            {
              name: 'store',
              type: 'address',
              description: 'The address of the claimed Store contract',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getUserStore(user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the UserStore address claimed by a given user. Returns
          <code
            class="text-xs font-mono text-dot-accent bg-dot-surface-secondary px-1 py-0.5 rounded"
            >address(0)</code
          >
          if no UserStore has been claimed.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
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
              description: 'UserStore address, or the zero address if none claimed',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getLabelStore(user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the LabelStore address for a user, or the zero address if none has been deployed.
          LabelStores are deployed by the protocol during registration, not claimed by users.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user address to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'store', type: 'address', description: 'LabelStore address, or zero' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            deployLabelStoreFor(user)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Deploys a LabelStore for a user. Called by the protocol during the first registration; not
          a user-facing action.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user to deploy a LabelStore for',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'store', type: 'address', description: 'The deployed LabelStore address' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">Enumeration</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          <code class="text-xs font-mono text-dot-accent">getUserStoreCount()</code> and
          <code class="text-xs font-mono text-dot-accent">getLabelStoreCount()</code> return the
          number of stores deployed, and
          <code class="text-xs font-mono text-dot-accent">getUserStores(offset, limit)</code> /
          <code class="text-xs font-mono text-dot-accent">getLabelStores(offset, limit)</code>
          return paginated address lists.
        </p>
      </div>

      <DocCallout variant="info" title="Beacons and upgrades">
        <code class="text-xs font-mono text-dot-accent">userStoreBeacon()</code>,
        <code class="text-xs font-mono text-dot-accent">labelStoreBeacon()</code> and
        <code class="text-xs font-mono text-dot-accent">protocolRegistry()</code> expose the proxy
        beacons and the protocol registry. Both store types are beacon proxies, so the
        governance-only
        <code class="text-xs font-mono text-dot-accent">upgradeUserStoreImplementation</code> /
        <code class="text-xs font-mono text-dot-accent">upgradeLabelStoreImplementation</code>
        upgrade every store of that type at once.
      </DocCallout>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">UserStore Functions</h2>
      <p class="text-sm text-dot-text-secondary">
        A UserStore is your personal key/value store for custom data such as content CIDs. Keys are
        <code class="text-xs font-mono text-dot-accent">bytes32</code> and values are arbitrary
        bytes; each key keeps an append-only history. Writes are restricted to the store owner.
      </p>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setValue(key, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets the value at a key. Owner only. Writing empty bytes clears the key.
        </p>
        <DocParamTable
          :params="[
            { name: 'key', type: 'bytes32', description: 'The storage key', required: true },
            { name: 'value', type: 'bytes', description: 'The value to store', required: true },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">getValue(key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the value stored at a key, or empty bytes if unset.
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
            { name: 'value', type: 'bytes', description: 'The stored value, or empty bytes' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">hasValue(key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns whether a key currently holds a value.
        </p>
        <DocParamTable
          :params="[
            { name: 'key', type: 'bytes32', description: 'The storage key', required: true },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'present', type: 'bool', description: 'True if the key is set' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">Key enumeration</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          <code class="text-xs font-mono text-dot-accent">getKeyCount()</code> returns the number of
          keys, <code class="text-xs font-mono text-dot-accent">getKeyAt(index)</code> returns a
          single key, and
          <code class="text-xs font-mono text-dot-accent">getKeys(offset, limit)</code> returns a
          paginated <code class="text-xs font-mono text-dot-accent">bytes32[]</code> of keys.
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">History</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Every key retains its prior values.
          <code class="text-xs font-mono text-dot-accent">getHistoryCount(key)</code>,
          <code class="text-xs font-mono text-dot-accent">getHistoryAt(key, index)</code> and
          <code class="text-xs font-mono text-dot-accent">getHistory(key, offset, limit)</code>
          read the append-only entries for a key.
          <code class="text-xs font-mono text-dot-accent">owner()</code> returns the store owner.
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">LabelStore Functions</h2>
      <p class="text-sm text-dot-text-secondary">
        A LabelStore is the read-oriented index of the .dot names an account holds. The protocol
        writes to it during registration through
        <code class="text-xs font-mono text-dot-accent">storeLabel</code> (registry-gated, not
        user-callable); you do not write custom data here. Entries are keyed by labelhash.
      </p>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getLabel(labelhash)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">Returns the stored label for a labelhash.</p>
        <DocParamTable
          :params="[
            {
              name: 'labelhash',
              type: 'bytes32',
              description: 'keccak256 of the label',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'label', type: 'string', description: 'The label, or empty if unset' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            hasLabel / isLocked
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          <code class="text-xs font-mono text-dot-accent">hasLabel(labelhash)</code> returns whether
          a label is stored;
          <code class="text-xs font-mono text-dot-accent">isLocked(labelhash)</code> returns whether
          it is locked. Both take a single
          <code class="text-xs font-mono text-dot-accent">bytes32</code> labelhash.
        </p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">Label enumeration</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          <code class="text-xs font-mono text-dot-accent">getLabelCount()</code> returns the number
          of names; <code class="text-xs font-mono text-dot-accent">getLabelAt(index)</code> /
          <code class="text-xs font-mono text-dot-accent">getLabelhashAt(index)</code> return a
          single entry; and
          <code class="text-xs font-mono text-dot-accent">getLabels(offset, limit)</code> /
          <code class="text-xs font-mono text-dot-accent">getLabelhashes(offset, limit)</code>
          return paginated lists over the same indices.
          <code class="text-xs font-mono text-dot-accent">owner()</code> returns the store owner.
        </p>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="store.ts" />
    </div>

    <DocCallout variant="info" title="Two stores per account">
      Each account has at most one UserStore and one LabelStore. The UserStore is claimed by the
      owner via <code class="text-xs font-mono text-dot-accent">claimUserStore</code> and holds
      custom records; the LabelStore is deployed by the protocol on first registration and lists the
      account's names. Names written to the LabelStore during registration are locked.
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
    name: "getUserStore",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimUserStore",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "nonpayable",
  },
] as const;

const storeAbi = [
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

const STORE_FACTORY = "0x692047C1477a017F287488E1c85F96Ca28C23fD8";

// Get or claim a Store
let storeAddress = await client.readContract({
  address: STORE_FACTORY,
  abi: storeFactoryAbi,
  functionName: "getUserStore",
  args: [walletClient.account.address],
});

if (storeAddress === zeroAddress) {
  await walletClient.writeContract({
    address: STORE_FACTORY,
    abi: storeFactoryAbi,
    functionName: "claimUserStore",
  });
  storeAddress = await client.readContract({
    address: STORE_FACTORY,
    abi: storeFactoryAbi,
    functionName: "getUserStore",
    args: [walletClient.account.address],
  });
}

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
