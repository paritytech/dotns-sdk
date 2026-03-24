<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Transfers</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS names are <span class="text-dot-text-primary font-medium">ERC721 NFTs</span>, which
        means they can be transferred using the standard
        <span class="font-mono text-dot-accent">safeTransferFrom</span> function. When a name is
        transferred, the protocol automatically updates the Store records for both parties.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Standard ERC721 Transfer</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">DotnsRegistrar</span> implements the full ERC721
        interface. You can transfer a .dot name using any standard NFT transfer method:
      </p>
      <DocCodeBlock :code="transferCode" lang="solidity" filename="transfer" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What Happens on Transfer</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        When an ERC721 transfer happens, the Registrar runs extra steps beyond the standard token
        transfer to keep DotNS data in sync:
      </p>
      <div class="space-y-3">
        <div
          v-for="(step, i) in transferSteps"
          :key="i"
          class="flex items-start gap-4 p-4 border border-dot-border rounded-lg bg-dot-surface"
        >
          <div
            class="w-8 h-8 rounded-lg bg-dot-surface-secondary text-dot-text-primary flex items-center justify-center text-sm font-bold shrink-0"
          >
            {{ i + 1 }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ step.title }}</p>
            <p class="text-xs text-dot-text-secondary mt-1">{{ step.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Store Record Migration</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Registrar reads the name's label from the sender's Store and writes it to the
        recipient's Store, so the new owner has the registration record linked to their address. If
        either party does not have a Store deployed, the write is silently skipped (no revert).
      </p>
      <DocCodeBlock
        :code="storeMigrationCode"
        lang="solidity"
        filename="store migration on transfer"
      />
      <DocCallout variant="info" title="Silent failure">
        The Store write during transfer is wrapped in a try/catch. If the recipient does not have a
        Store deployed yet, or if any other issue prevents the write, the transfer still succeeds.
        The NFT ownership always transfers regardless of Store state.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Transfer Targets</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        You can transfer a .dot name to several types of recipient:
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-dot-accent" />
            <p class="text-sm font-semibold text-dot-text-primary">EVM Address</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Transfer directly to any <span class="font-mono">0x...</span> Ethereum-compatible
            address on the Polkadot EVM layer.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-success" />
            <p class="text-sm font-semibold text-dot-text-primary">Substrate Address</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Transfer to a Substrate (SS58) address. You must convert the Substrate address to its
            matching EVM address before calling the on-chain transfer.
          </p>
        </div>
        <div class="p-5 border border-dot-border rounded-xl bg-dot-surface">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2.5 h-2.5 rounded-full bg-warning" />
            <p class="text-sm font-semibold text-dot-text-primary">.dot Name</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed">
            Transfer to another .dot name. Resolve the name to its owner address using the
            DotnsResolver first, then execute the transfer.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Transfer Examples</h2>
      <DocCodeBlock :code="solidityExample" lang="solidity" filename="TransferExample.sol" />
      <DocCodeBlock :code="tsExample" lang="typescript" filename="transfer.ts" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Important Notes</h2>
      <div class="space-y-3">
        <DocCallout variant="warning" title="Reverse record not updated">
          Transferring a name does <strong>not</strong> automatically update the reverse resolver.
          If the sender's reverse record pointed to the transferred name, it will become outdated.
          The recipient must set their own reverse record if they want the name to display for their
          address.
        </DocCallout>
        <DocCallout variant="info" title="Approval patterns">
          Standard ERC721 approval patterns apply. Use
          <span class="font-mono">approve(operator, tokenId)</span> to approve a single name or
          <span class="font-mono">setApprovalForAll(operator, true)</span> to approve all your names
          at once. Marketplaces and transfer tools rely on these patterns.
        </DocCallout>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registry Ownership Update</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Registrar's transfer hook also updates the
        <span class="font-mono text-dot-accent">DotnsRegistry</span> to reflect the new owner. This
        means <span class="font-mono text-dot-text-primary">registry.owner(node)</span>
        always returns the current NFT holder's address, keeping the registry and token ownership in
        sync.
      </p>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/store"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; On-Chain Storage
      </RouterLink>
      <RouterLink to="/docs/contracts/overview" class="text-dot-accent hover:text-dot-accent-hover">
        Contracts Overview &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";

const transferCode = `// Standard ERC721 transfer
registrar.safeTransferFrom(from, to, tokenId);

// The tokenId is uint256(node) — derived from the name's node hash
// Example: tokenId for "alice.dot" = uint256(keccak256(DOT_NODE, keccak256("alice")))`;

const transferSteps = [
  {
    title: "ERC721 token moves to new owner",
    description:
      "The NFT representing the .dot name is transferred from sender to recipient using standard ERC721 logic.",
  },
  {
    title: "Registry ownership updated",
    description:
      "The Registrar's transfer hook updates the DotnsRegistry so that registry.owner(node) returns the new owner.",
  },
  {
    title: "Store record migrated",
    description:
      "The Registrar reads the name label from the sender's Store and writes it to the recipient's Store. Silently skipped if either Store does not exist.",
  },
];

const storeMigrationCode = `// Inside Registrar's _afterTokenTransfer hook (simplified):
function _afterTokenTransfer(address from, address to, uint256 tokenId) internal {
    bytes32 node = bytes32(tokenId);

    // Update registry ownership
    registry.setOwner(node, to);

    // Migrate store record (silent on failure)
    try storeFactory.getStore(from) returns (address fromStore) {
        bytes memory label = Store(fromStore).read(storeKey);
        try storeFactory.getStore(to) returns (address toStore) {
            Store(toStore).write(storeKey, label);
        } catch {}
    } catch {}
}`;

const solidityExample = `// Transfer "alice.dot" to a new owner
bytes32 DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce;
bytes32 node = keccak256(abi.encodePacked(DOT_NODE, keccak256("alice")));
uint256 tokenId = uint256(node);

// Standard ERC721 transfer
registrar.safeTransferFrom(msg.sender, newOwner, tokenId);`;

const tsExample = `import { namehash } from "viem";

const REGISTRAR = "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD";

// Compute the tokenId for "alice.dot"
const node = namehash("alice.dot");
const tokenId = BigInt(node);

// Transfer to an EVM address
await walletClient.writeContract({
  address: REGISTRAR,
  abi: registrarAbi,
  functionName: "safeTransferFrom",
  args: [walletClient.account.address, recipient, tokenId],
});

// Transfer to a .dot name (resolve first, then transfer)
const bobAddr = await client.readContract({
  address: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
  abi: resolverAbi,
  functionName: "addressOf",
  args: [namehash("bob.dot")],
});
await walletClient.writeContract({
  address: REGISTRAR,
  abi: registrarAbi,
  functionName: "safeTransferFrom",
  args: [walletClient.account.address, bobAddr, tokenId],
});`;
</script>
