<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">On-Chain Storage</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Every DotNS user gets a dedicated
        <span class="text-dot-text-primary font-medium">Store</span>
        contract &mdash; a per-user key-value store deployed by the
        <span class="font-mono text-dot-accent">StoreFactory</span>. The Store holds registration
        records, name associations, and user-defined data on-chain.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">StoreFactory</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">StoreFactory</span> deploys a new Store contract
        for each user on their first registration. Each Store is owned by the user's address and
        stores all their DotNS-related records in a single contract.
      </p>
      <DocCodeBlock :code="storeFactoryCode" lang="solidity" filename="StoreFactory.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Format</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Store keys are <span class="font-mono text-dot-text-primary">bytes32</span> values. The
        protocol uses a structured key format to namespace registration records and prevent
        collisions.
      </p>
      <DocCodeBlock :code="keyFormatCode" lang="solidity" filename="key format" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Key Derivation Example</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p>
            <span class="text-dot-text-tertiary">DOTNS_REGISTERED_KEY</span> =
            bytes32("dotns.registered")
          </p>
          <p><span class="text-dot-text-tertiary">labelhash</span> = keccak256("alice")</p>
          <p>
            <span class="text-dot-text-tertiary">storeKey</span> = keccak256(DOTNS_REGISTERED_KEY,
            labelhash)
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Immutable vs. Mutable Keys</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Store has two write modes depending on who is writing:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-error" />
            <p class="text-sm font-semibold text-dot-text-primary">DotNS Controller Writes</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            When the Controller writes a registration record, the key is
            <span class="text-dot-text-primary font-medium">locked</span> after the first write.
            This makes registration records immutable &mdash; once written, they cannot be
            overwritten or deleted, even by the user.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-success" />
            <p class="text-sm font-semibold text-dot-text-primary">Regular User Writes</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Users can write their own mutable keys to the Store. These can be updated or overwritten
            at any time. User keys are useful for storing custom metadata or application-specific
            data.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Authorisation Model</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Store distinguishes between two types of writers. This dual-authority model keeps
        protocol-critical data tamper-proof while still allowing user flexibility.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Writer Type</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Who</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Key Behavior</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Use Case</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-text-primary text-xs">DotNS Controller</td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                RegistrarController contract
              </td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                Key locked after first write (immutable)
              </td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">Registration records</td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-text-primary text-xs">Authorised Writer</td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                Store owner or approved address
              </td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">
                Key is mutable (can overwrite)
              </td>
              <td class="px-4 py-3 text-dot-text-secondary text-xs">Custom user data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Store API</h2>
      <DocCodeBlock :code="storeApiCode" lang="solidity" filename="Store.sol" />
    </div>

    <DocCallout variant="info" title="One Store per user">
      Each address has at most one Store contract. The StoreFactory uses CREATE2 for deterministic
      deployment, so the Store address for any user can be computed off-chain without querying the
      chain.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What Gets Stored on Registration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When you register a .dot name, the Controller writes an immutable record to your Store. This
        record serves as an on-chain proof that the name was registered to your address and enables
        efficient enumeration of all names owned by an address.
      </p>
      <DocCodeBlock :code="registrationRecordCode" lang="solidity" filename="registration record" />
    </div>

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

const storeFactoryCode = `// StoreFactory deploys a per-user Store on first registration
function getOrDeployStore(address user) external returns (address store);

// Deterministic address — compute off-chain with CREATE2
function computeStoreAddress(address user) external view returns (address);`;

const keyFormatCode = `// The protocol-reserved key prefix for registration records
bytes32 constant DOTNS_REGISTERED_KEY = bytes32("dotns.registered");

// Compute the store key for a specific name
bytes32 labelhash = keccak256(abi.encodePacked("alice"));
bytes32 storeKey = keccak256(abi.encodePacked(DOTNS_REGISTERED_KEY, labelhash));

// This key is used to store the registration record in the user's Store
// Once written by the Controller, this key is permanently locked`;

const storeApiCode = `// Write a value (authorised writers only)
function write(bytes32 key, bytes calldata value) external;

// Write with lock (DotNS controller only — key becomes immutable)
function writeAndLock(bytes32 key, bytes calldata value) external;

// Read a value (anyone)
function read(bytes32 key) external view returns (bytes memory);

// Check if a key is locked
function isLocked(bytes32 key) external view returns (bool);

// Authorise another address to write to your Store
function authorise(address writer, bool approved) external;`;

const registrationRecordCode = `// During registration, the Controller calls:
store.writeAndLock(storeKey, abi.encode(label, owner, block.timestamp));

// This creates an immutable record:
// - key:   keccak256(DOTNS_REGISTERED_KEY, labelhash)
// - value: abi.encode(label, owner, timestamp)
// - locked: true (cannot be overwritten)`;
</script>
