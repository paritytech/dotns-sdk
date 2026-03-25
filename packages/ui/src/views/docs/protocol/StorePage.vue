<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">On-Chain Storage</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Each DotNS user has a dedicated
        <span class="text-dot-text-primary font-medium">Store</span> contract &mdash; a
        non-upgradeable key-value store that holds registration records, name associations, and
        user-defined data. The protocol writes to it; the user owns it.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Why per-user Stores?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Name data (labels, IPFS URIs, text records) must survive protocol contract upgrades. If it
        lived inside the protocol contracts, upgrading those contracts would mean migrating or
        losing user data. By putting each user's data in a separate, non-upgradeable Store, the
        protocol can swap out its own contracts without touching user state.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        The Store also enables
        <span class="text-dot-text-primary font-medium">permanent locking</span>. When the
        RegistrarController writes a registration record via
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >setValueFor</code
        >, the key is locked forever. Not the user, not the Store owner, not governance &mdash;
        nobody can overwrite or delete it. Registration records are immutable.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">StoreFactory</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >StoreFactory</code
        >
        deploys exactly one Store per address using the CREATE opcode. On first registration, the
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >StoreUtils.getOrCreateStore()</code
        >
        library function deploys a Store, authorises the protocol contracts as DotNS controllers,
        transfers Ownable ownership to the user, and remaps the factory's internal lookup.
      </p>
      <DocCodeBlock :code="storeFactoryCode" lang="solidity" filename="StoreFactory.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Ownership Model</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Two distinct ownership concepts exist and both must be transferred together:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <p class="text-sm font-semibold text-dot-text-primary mb-2">Factory Mapping</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >StoreFactory._deployedStores[owner]</code
            >
            &mdash; tracks which address owns which Store for lookup purposes. Updated via
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >factory.transferOwnership(newOwner)</code
            >.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <p class="text-sm font-semibold text-dot-text-primary mb-2">Store Owner (Ownable)</p>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >Store.owner()</code
            >
            &mdash; controls who can authorise or revoke writers. Updated via
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >store.transferOwnership(newOwner)</code
            >.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Format</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Store keys are
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >bytes32</code
        >. The protocol reserves the
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >dotns.registered</code
        >
        prefix for registration records. The actual key is derived as
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >keccak256(abi.encodePacked(prefix, labelhash))</code
        >.
      </p>
      <DocCodeBlock :code="keyFormatCode" lang="solidity" filename="StoreUtils.sol" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Key Derivation Example</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p><span class="text-dot-text-tertiary">prefix</span> = bytes32("dotns.registered")</p>
          <p><span class="text-dot-text-tertiary">labelhash</span> = keccak256("alice")</p>
          <p><span class="text-dot-text-tertiary">storeKey</span> = keccak256(prefix, labelhash)</p>
          <p><span class="text-dot-text-tertiary">value</span> = "alice.dot"</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Write Modes</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Store has two write paths. The critical difference is locking:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-error" />
            <p class="text-sm font-semibold text-dot-text-primary">DotNS Controller</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Calls
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >setValueFor(user, key, value)</code
            >. If the caller is marked as a DotNS controller, the key is
            <span class="text-dot-text-primary font-medium">locked permanently</span> after the
            write. Used during registration to create immutable records.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-success" />
            <p class="text-sm font-semibold text-dot-text-primary">User / Authorized Writer</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Calls
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >setValue(key, value)</code
            >. Mutable &mdash; can be overwritten or deleted at any time. Reverts if the key was
            previously locked. Used for custom metadata.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Store API</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The actual function signatures from the deployed Store contract:
      </p>
      <DocCodeBlock :code="storeApiCode" lang="solidity" filename="IStore.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What Happens During Registration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When you register
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >alice.dot</code
        >, the Controller writes the string
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >"alice.dot"</code
        >
        to your Store under the derived key. Because the Controller is a DotNS controller, the key
        is locked. The Store now permanently records that this address registered
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >alice.dot</code
        >.
      </p>
      <DocCodeBlock :code="registrationRecordCode" lang="solidity" filename="registration flow" />
    </div>

    <TryItSection title="Store Lookup">
      <TryStoreLookup />
    </TryItSection>

    <DocCallout variant="warning" title="Store ownership transfer is irreversible">
      The StoreFactory's
      <code
        class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
        >transferOwnership</code
      >
      function can transfer Store ownership to
      <code
        class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
        >address(0)</code
      >, effectively burning the Store. All locked entries (names and CIDs) become permanently
      orphaned and inaccessible. The previous owner loses control of their Store and all data
      written to it. This action cannot be undone. Name tokens themselves cannot be burned &mdash;
      the Registrar does not expose a burn function.
    </DocCallout>

    <DocCallout variant="info" title="One Store per address">
      The StoreFactory enforces one Store per address. If a user doesn't have a Store when the
      Registrar needs to write to it (during a transfer), one is deployed on the fly. The Store
      accumulates a record of every name an address has ever received.
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

const storeFactoryCode = `// Each address can deploy exactly one Store
function deploy() external returns (IStore);

// Lookup — returns address(0) if no Store exists
function getDeployedStore(address who) external view returns (IStore);

// Remap the factory's internal lookup (does NOT transfer Store.owner)
function transferOwnership(address newOwner) external;

// The StoreUtils library handles the common pattern:
// 1. Check if Store exists for owner
// 2. If not, deploy + authorize controllers + transfer ownership
function getOrCreateStore(
    IStoreFactory factory,
    address[] memory controllers,
    address owner
) internal returns (Store);`;

const keyFormatCode = `// Key prefix reserved for DotNS registration records
bytes32 constant DOTNS_REGISTERED_KEY = bytes32("dotns.registered");

// Derive the store key for a label
function storeKey(bytes32 labelhash) internal pure returns (bytes32 key) {
    // key = keccak256(DOTNS_REGISTERED_KEY, labelhash)
    // Uses scratch-space assembly to avoid ABI-encoding overhead
}

// Example: key for "alice" =
//   keccak256(bytes32("dotns.registered"), keccak256("alice"))
// Value stored: "alice.dot"`;

const storeApiCode = `// User writes to their own namespace (mutable, reverts if key is locked)
function setValue(bytes32 key, string calldata value) external;

// Authorized contract writes on behalf of a user
// If caller is a DotNS controller, the key is locked permanently after write
function setValueFor(address user, bytes32 key, string calldata value) external;

// Read from caller's namespace
function getValue(bytes32 key) external view returns (string memory);

// Read from any user's namespace
function getValueFor(address user, bytes32 key) external view returns (string memory);

// Delete (reverts if key is locked)
function deleteValue(bytes32 key) external;

// Check lock state
function isLocked(address user, bytes32 key) external view returns (bool);

// Owner-only: manage who can call setValueFor
function authorizeStore(address writer) external;
function unauthorizeStore(address writer) external;

// Owner-only: mark an address as DotNS controller (writes lock keys)
function authorizeDotnsController(address controller) external;
function unauthorizeDotnsController(address controller) external;`;

const registrationRecordCode = `// 1. Controller computes the store key
bytes32 labelhash = keccak256(bytes("alice"));
bytes32 key = StoreUtils.storeKey(labelhash);

// 2. Controller writes to the user's Store via setValueFor
//    Because the Controller is a DotNS controller, the key is locked after write
store.setValueFor(owner, key, "alice.dot");

// 3. The key is now permanently locked:
//    store.isLocked(owner, key) == true
//    store.setValueFor(owner, key, "anything") reverts with KeyLocked
//    store.setValue(key, "anything") reverts with KeyLocked (even if called by owner)`;
</script>
