<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Transfers</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        DotNS names are <span class="text-dot-text-primary font-medium">ERC721 NFTs</span>, which
        means they can be transferred using the standard
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >safeTransferFrom</code
        >
        function. When a name is transferred, the registrar keeps the registry owner in sync and
        records the label on the recipient's LabelStore.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Standard ERC721 Transfer</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >DotnsRegistrar</code
        >
        implements the full ERC721 interface. You can transfer a .dot name using any standard NFT
        transfer method:
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
      <h2 class="text-xl font-semibold text-dot-text-primary">Transfer Fee</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Most transfers are free. A non-refundable friction fee equal to the
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >transferFloor</code
        >
        is charged only on a downward or reach-floor move: when the recipient's PoP tier is strictly
        below the sender's, or the recipient cannot reach the label's required tier. Same-tier and
        upward transfers between holders of the label's own class pay nothing. The fee is not
        length-based; it is the single constant the registrar reads from PopRules.
      </p>
      <p class="text-dot-text-secondary leading-relaxed">
        Quote the fee before transferring with
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >quoteTransferFee</code
        >
        on the registrar, then pass that amount as
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >msg.value</code
        >.
      </p>
      <DocCodeBlock :code="transferFeeCode" lang="solidity" filename="quoteTransferFee" />
      <DocCallout variant="info" title="Zero fee until the LabelStore is settled">
        The registrar derives the floor by reading the label from the sender's LabelStore. A
        gateway-issued name held by a user who has not yet called
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >claimLabelStore</code
        >
        has no readable label, so the quoted fee is zero regardless of the recipient's tier. Treat
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >claimLabelStore</code
        >
        as a prerequisite for accurate transfer-time pricing.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">LabelStore on Transfer</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The LabelStore is append-only. On transfer the registrar records a fresh label entry on the
        recipient's LabelStore and leaves the sender's locked entry in place, so each address keeps
        its own lifetime-of-ownership ledger. The deposit, when present, is bound to the name and
        rides with it &mdash; the escrow position rebinds to the recipient rather than being
        refunded.
      </p>
      <DocCallout variant="info" title="Best-effort, never blocking">
        The recipient LabelStore write is best-effort: if the recipient has no LabelStore deployed
        yet, the write is skipped and the NFT transfer still succeeds. Token ownership always
        transfers regardless of store state.
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
            Transfer directly to any
            <code
              class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
              >0x...</code
            >
            Ethereum-compatible address on the Polkadot EVM layer.
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
        <DocCallout variant="warning" title="Reverse record fails closed">
          The reverse resolver re-validates current ownership on every read, so once a name is
          transferred,
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >nameOf</code
          >
          returns an empty string for the previous owner until they claim a name they still hold.
          The protocol also best-effort clears the entry on transfer. The recipient must call
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >claimReverseRecord</code
          >
          to make the name display for their own address.
        </DocCallout>
        <DocCallout variant="info" title="Approval patterns">
          Standard ERC721 approval patterns apply. Use
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >approve(operator, tokenId)</code
          >
          to approve a single name or
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >setApprovalForAll(operator, true)</code
          >
          to approve all your names at once. Marketplaces and transfer tools rely on these patterns.
        </DocCallout>
        <DocCallout variant="info" title="Deposit travels with the name">
          When a name carries a refundable NoStatus deposit, the locked amount is bound to the name,
          not the depositor. Transferring the name rebinds the escrow position to the recipient
          rather than refunding the sender, so a funded transfer hands the locked deposit to the new
          holder. Only releasing the name back to escrow ever unlocks it. Name tokens cannot be
          burned &mdash; the Registrar exposes no burn function.
        </DocCallout>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Registry Ownership Update</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The Registrar's transfer hook also updates the
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >DotnsRegistry</code
        >
        to reflect the new owner, keeping the registry and token ownership in sync. Live ownership
        is the registrar's
        <code
          class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
          >ownerOf(tokenId)</code
        >, so management rights follow the token automatically once it changes hands.
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
      "The Registrar's transfer hook updates the DotnsRegistry so the recorded owner stays in sync with the NFT holder.",
  },
  {
    title: "Friction fee settled (if owed)",
    description:
      "The Registrar quotes the transfer floor from PopRules. A downward or reach-floor move charges the transferFloor; same-tier and upward moves are free.",
  },
  {
    title: "Label recorded on recipient's LabelStore",
    description:
      "The Registrar appends a fresh label entry to the recipient's LabelStore. Best-effort: skipped if the recipient has no LabelStore yet, and never blocks the transfer.",
  },
];

const transferFeeCode = `// Quote the fee for a prospective transfer (zero when no friction is owed)
function quoteTransferFee(uint256 tokenId, address to)
    external view returns (uint256 fee);

// Example: check then transfer
uint256 fee = registrar.quoteTransferFee(tokenId, recipient);
registrar.safeTransferFrom{value: fee}(msg.sender, recipient, tokenId);`;

const solidityExample = `// Transfer "alice.dot" to a new owner
bytes32 DOT_NODE = 0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce;
bytes32 node = keccak256(abi.encodePacked(DOT_NODE, keccak256("alice")));
uint256 tokenId = uint256(node);

// Standard ERC721 transfer
registrar.safeTransferFrom(msg.sender, newOwner, tokenId);`;

const tsExample = `import { namehash } from "viem";

const REGISTRAR = "0xf7Ad3F44F316C73E4a2b46b1ed48d376bCc9E639";

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
  address: "0xA8988eA083174ea94Ed1D686f0F073a10f65598D",
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
