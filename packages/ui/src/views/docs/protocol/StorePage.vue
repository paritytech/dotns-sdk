<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">On-Chain Storage</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Stores are DotNS's per-user storage layer. Each address gets at most one of two store kinds,
        forever: a protocol-managed
        <span class="text-dot-text-primary font-medium">LabelStore</span> that holds the
        registration ledger, and a user-claimed
        <span class="text-dot-text-primary font-medium">UserStore</span> for arbitrary records the
        user publishes. The <span class="font-mono text-dot-accent">StoreFactory</span> is the
        single source of truth for which store belongs to which user.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why per-user Stores?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Two questions the rest of the system needs to answer have nowhere else to live. "What names
        has this address ever held?" cannot be served by resolvers, which are keyed per-node, nor by
        the registry, which tracks live ownership with no history. "What user-controlled records
        does this address publish?" has no home on a resolver because the data is not bound to any
        one name. Stores fill both gaps.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <p class="text-sm font-semibold text-dot-text-primary mb-2">
            LabelStore (protocol-managed)
          </p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            The registrar and controller write a label entry once and the slot is permanently
            locked. Entries are append-only, so transferring a name writes a fresh entry on the
            recipient and leaves the sender's locked entry in place. This makes the LabelStore the
            address's lifetime-of-ownership ledger. The invariant is labels only.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <p class="text-sm font-semibold text-dot-text-primary mb-2">UserStore (user-claimed)</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            The bound owner is the only writer, and prior values are snapshotted into a per-key
            history. It exists so that user-controlled records that do not belong to a name have a
            home that bills the user's own contract rather than polluting a shared resolver.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">StoreFactory</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >StoreFactory</code
        >
        deploys at most one of each store kind per address.
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >claimUserStore()</code
        >
        lets a caller deploy and claim their own UserStore, while
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >deployLabelStoreFor(owner)</code
        >
        is the protocol-driven path that creates a user's LabelStore. The factory tracks both via
        separate lookups, each backed by an upgradeable beacon.
      </p>
      <DocCodeBlock :code="storeFactoryCode" lang="solidity" filename="StoreFactory.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">The labels-only invariant</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The split keeps the two halves cleanly separated. Every per-name record category &mdash;
        reverse, content, forward address, chat key, lite link &mdash; lives on a dedicated
        resolver, never in a store. The LabelStore holds only labels, and nothing user-written ever
        lands on the protocol-managed side. The UserStore is the only place a user can write, and it
        bills the user's own contract rather than a shared resolver.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">LabelStore API</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The LabelStore is read-only from a client's perspective &mdash; only the registrar and
        controller write to it, and each entry is locked once written.
      </p>
      <DocCodeBlock :code="labelStoreApiCode" lang="solidity" filename="ILabelStore.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">UserStore API</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The UserStore is a key-value store the bound owner controls. Writes snapshot the prior value
        into a per-key history, so earlier values remain readable.
      </p>
      <DocCodeBlock :code="userStoreApiCode" lang="solidity" filename="IUserStore.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What Happens During Registration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When you register
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >alice.dot</code
        >, the controller records the label in your LabelStore as a permanent, locked entry. The
        LabelStore now holds
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >alice</code
        >
        as part of your lifetime-of-ownership ledger. Your UserStore is untouched &mdash; it only
        ever holds records you write yourself.
      </p>
      <DocCodeBlock :code="registrationRecordCode" lang="solidity" filename="registration flow" />
    </div>

    <TryItSection title="Store Lookup">
      <TryStoreLookup />
    </TryItSection>

    <DocCallout variant="warning" title="LabelStore entries are permanent">
      LabelStore entries are append-only and locked once written. Transferring a name writes a fresh
      entry on the recipient's LabelStore and leaves the sender's locked entry in place, so the
      LabelStore is a durable lifetime-of-ownership ledger rather than a live-ownership record. For
      live ownership, query the registry; the LabelStore answers "has this address ever held this
      label?".
    </DocCallout>

    <DocCallout variant="info" title="At most one of each store per address">
      The StoreFactory binds at most one LabelStore and one UserStore to each address, forever, and
      is the single source of truth for which store belongs to which user. The UserStore is claimed
      by the user; the LabelStore is deployed by the protocol.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/subdomains"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Subdomains
      </RouterLink>
      <RouterLink to="/docs/protocol/transfers" class="text-dot-accent hover:text-dot-accent-hover">
        Transfers &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryStoreLookup from "@/components/docs/interactive/TryStoreLookup.vue";

const storeFactoryCode = `// UserStore — the caller claims their own (deploys one on first call)
function claimUserStore() external returns (address store);
function getUserStore(address user) external view returns (address store);
function getUserStoreCount() external view returns (uint256 count);
function getUserStores(uint256 offset, uint256 limit)
    external view returns (address[] memory stores);

// LabelStore — protocol-deployed on behalf of a user
function deployLabelStoreFor(address owner) external returns (address store);
function getLabelStore(address user) external view returns (address store);
function getLabelStoreCount() external view returns (uint256 count);
function getLabelStores(uint256 offset, uint256 limit)
    external view returns (address[] memory stores);`;

const labelStoreApiCode = `// Read the labels this address has ever held (lifetime ledger)
function getLabels() external view returns (string[] memory);

// Check whether a specific label is recorded
function hasLabel(string calldata label) external view returns (bool);

// Each entry is locked once written; this reports lock state
function isLocked(string calldata label) external view returns (bool);`;

const userStoreApiCode = `// Owner writes a value under a key (prior value snapshotted to history)
function setValue(bytes32 key, bytes calldata value) external;

// Read the current value stored under a key
function getValue(bytes32 key) external view returns (bytes memory);

// Enumerate the keys held by this UserStore
function getKeys() external view returns (bytes32[] memory);`;

const registrationRecordCode = `// 1. The protocol resolves (or deploys) the owner's LabelStore
address labelStore = factory.getLabelStore(owner);
if (labelStore == address(0)) {
    labelStore = factory.deployLabelStoreFor(owner);
}

// 2. The controller records the label as a permanent, locked entry
//    (only the registrar and controller can write the LabelStore)

// 3. Anyone can read the ledger back
string[] memory labels = ILabelStore(labelStore).getLabels(); // ["alice", ...]
bool held = ILabelStore(labelStore).hasLabel("alice");        // true`;
</script>
