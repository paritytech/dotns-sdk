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
          The caller claims their UserStore beacon-proxy. Self-claim only: the resulting store owner
          is always the caller, regardless of who pays gas. One store per caller, forever.
        </p>
        <DocReturnsTable
          :returns="[
            {
              name: 'store',
              type: 'address',
              description: 'The deployed store address',
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller already has a UserStore (AlreadyDeployed).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getUserStore(user)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the UserStore address bound to a user, or the zero address if none.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'store',
              type: 'address',
              description: 'The bound store address, or zero',
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
          Returns the LabelStore address bound to a user, or the zero address if none. LabelStores
          are deployed by the protocol during registration, not claimed by users.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'store', type: 'address', description: 'The bound store address, or zero' },
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
          Deploys a LabelStore beacon-proxy bound to a user. Callable by the factory owner or any
          address currently registered in the protocol registry; called by the protocol during
          registration, not a user-facing action. The user must not already have a LabelStore.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'user',
              type: 'address',
              description: 'The user the store is bound to forever',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'store', type: 'address', description: 'The deployed store address' }]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller is neither the factory owner nor a protocol-registered address (NotAuthorised),
          the user is the zero address (InvalidUser), or the user already has a LabelStore
          (AlreadyDeployed).
        </DocCallout>
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
        bytes. Writes are restricted to the store owner, and prior values are snapshotted into a
        per-key history on every write.
      </p>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            setValue(key, value)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Sets the current value for a key. Callable only by the bound owner. If a non-empty prior
          value existed it is pushed into the per-key history list with the block timestamp; empty
          prior values produce no history entry.
        </p>
        <DocParamTable
          :params="[
            { name: 'key', type: 'bytes32', description: 'The key to write', required: true },
            {
              name: 'value',
              type: 'bytes',
              description: 'The new current value (may be empty)',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The caller is not the bound owner (NotOwner), or the key is zero (InvalidKey).
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">getValue(key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the current value under a key, or empty bytes if unset.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'key',
              type: 'bytes32',
              description: 'The key to read',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'value', type: 'bytes', description: 'The current value' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">hasValue(key)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns true if and only if the current value under a key has non-zero length.
        </p>
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
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">History and owner</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Each key keeps an append-only history:
          <code class="text-xs font-mono text-dot-accent">getHistoryCount(key)</code>,
          <code class="text-xs font-mono text-dot-accent">getHistoryAt(key, index)</code> and
          <code class="text-xs font-mono text-dot-accent">getHistory(key, offset, limit)</code> read
          prior values. <code class="text-xs font-mono text-dot-accent">owner()</code> returns the
          store owner.
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">LabelStore Functions</h2>
      <p class="text-sm text-dot-text-secondary">
        A LabelStore is the read-oriented index of the .dot names an account holds. The protocol
        writes to it during registration through
        <code class="text-xs font-mono text-dot-accent">storeLabel</code>, which is gated to
        addresses currently registered in the protocol registry and records a label under its
        labelhash, locking the slot permanently on first write. You do not write custom data here.
      </p>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            getLabel(labelhash)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the stored label for a labelhash, or the empty string if none.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'labelhash',
              type: 'bytes32',
              description: 'The labelhash to look up',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'label', type: 'string', description: 'The stored label string' }]"
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
          <code class="text-xs font-mono text-dot-accent">hasLabel(labelhash)</code> returns true if
          and only if a label has been stored under the labelhash;
          <code class="text-xs font-mono text-dot-accent">isLocked(labelhash)</code> returns true if
          and only if the slot for the labelhash is permanently locked. Both take a single
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
      <RouterLink to="/docs/dotli/overview" class="text-dot-accent hover:text-dot-accent-hover">
        The dot.li Browser &rarr;
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
