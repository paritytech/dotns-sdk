<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Contracts</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">DotnsRegistrar</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The Registrar is an
        <span class="text-dot-text-primary font-medium">ERC-721 NFT contract</span>
        that backs permanent .dot name ownership. Each registered name is an NFT, so names can be
        transferred or sold using any standard ERC-721 tooling.
      </p>
    </div>

    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-dot-text-primary">Deployed Address</h2>
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
        <p class="text-xs text-dot-text-tertiary mb-1">Paseo AssetHub</p>
        <p class="font-mono text-sm text-dot-accent break-all">
          0xf7Ad3F44F316C73E4a2b46b1ed48d376bCc9E639
        </p>
      </div>
    </div>

    <div class="space-y-6">
      <h2 class="text-xl font-semibold text-dot-text-primary">Key Functions</h2>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">available(id)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns whether a registration call may proceed for the given token ID.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'id',
              type: 'uint256',
              description: 'The token ID derived from the labelhash',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'isAvailable',
              type: 'bool',
              description: 'True when a registration call may proceed for the token ID',
            },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">ownerOf(tokenId)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the current owner of the NFT. Standard ERC721 function.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'tokenId',
              type: 'uint256',
              description: 'The token ID of the .dot name NFT',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            { name: 'owner', type: 'address', description: 'The address that owns the token' },
          ]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">balanceOf(owner)</h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Returns the number of .dot name NFTs owned by the given address.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'owner',
              type: 'address',
              description: 'The address to query',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[{ name: 'balance', type: 'uint256', description: 'Number of tokens owned' }]"
        />
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            safeTransferFrom(from, to, tokenId)
          </h3>
          <DocBadge variant="transaction">transaction</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Transfers a .dot name NFT to a new owner. Every transfer overload is
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >payable</code
          >: the registrar's update hook consults
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >PopRules.transferFloor</code
          >
          to compute a required reach floor, and if the caller does not forward at least that amount
          as
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >msg.value</code
          >
          the transfer reverts. Use
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >quoteTransferFee</code
          >
          to quote the fee before transferring.
        </p>
        <DocParamTable
          :params="[
            { name: 'from', type: 'address', description: 'Current owner address', required: true },
            { name: 'to', type: 'address', description: 'Recipient address', required: true },
            {
              name: 'tokenId',
              type: 'uint256',
              description: 'The token ID to transfer',
              required: true,
            },
          ]"
        />
        <DocCallout variant="warning" title="Reverts when">
          The recipient owes a non-zero reach floor and the caller has not forwarded it as
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >msg.value</code
          >
          (TransferFeeRequired), or the standard ERC-721 authorisation and recipient checks fail.
        </DocCallout>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <h3 class="text-base font-semibold text-dot-text-primary font-mono">
            quoteTransferFee(tokenId, to)
          </h3>
          <DocBadge variant="read-only">read-only</DocBadge>
        </div>
        <p class="text-sm text-dot-text-secondary">
          Quotes the additional native fee required to transfer a token to a recipient. Returns the
          reach floor from
          <code
            class="text-xs bg-dot-surface-secondary px-1.5 py-0.5 rounded border border-dot-border font-mono"
            >PopRules.transferFloor</code
          >: the maximum of the flat reach component charged when the recipient does not meet the
          label's required tier and the downgrade component charged when the recipient tier is
          strictly below the sender tier. Self-transfers and escrow-touching transfers return zero,
          as does a token whose sender has no stored label.
        </p>
        <DocParamTable
          :params="[
            {
              name: 'tokenId',
              type: 'uint256',
              description: 'The token ID to be transferred',
              required: true,
            },
            {
              name: 'to',
              type: 'address',
              description: 'The prospective recipient',
              required: true,
            },
          ]"
        />
        <DocReturnsTable
          :returns="[
            {
              name: 'requiredFee',
              type: 'uint256',
              description: 'The additional native fee required for the transfer, in wei',
            },
          ]"
        />
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Code Example</h2>
      <DocCodeBlock :code="exampleCode" lang="typescript" filename="registrar.ts" />
    </div>

    <DocCallout variant="warning" title="Fee on transfer">
      The Registrar polices a fee-on-transfer hook. When the recipient does not meet the label's
      required PoP tier, or their tier is strictly below the sender's, the transfer requires a reach
      floor to be forwarded as native value in the same call. Quote the amount with
      <code>quoteTransferFee</code> first.
    </DocCallout>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/contracts/registry"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Registry
      </RouterLink>
      <RouterLink
        to="/docs/contracts/controller"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Controller &rarr;
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

const exampleCode = `import { createPublicClient, defineChain, http, keccak256, toBytes } from "viem";

// ABI fragments for the functions used in this example
const registrarAbi = [
  {
    type: "function",
    name: "available",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
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

const REGISTRAR = "0xf7Ad3F44F316C73E4a2b46b1ed48d376bCc9E639";

// Check if a name is available
const labelhash = keccak256(toBytes("alice"));
const tokenId = BigInt(labelhash);

const isAvailable = await client.readContract({
  address: REGISTRAR,
  abi: registrarAbi,
  functionName: "available",
  args: [tokenId],
});
console.log("Available:", isAvailable);

// Get the current owner of a name
if (!isAvailable) {
  const owner = await client.readContract({
    address: REGISTRAR,
    abi: registrarAbi,
    functionName: "ownerOf",
    args: [tokenId],
  });
  console.log("Owner:", owner);
}`;
</script>
