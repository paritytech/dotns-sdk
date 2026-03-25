<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Content &amp; Profiles</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">DotnsContentResolver</span> stores two types of
        data for each .dot name:
        <span class="text-dot-text-primary font-medium">text records</span> (key-value pairs for
        profiles) and <span class="text-dot-text-primary font-medium">content hashes</span>
        (IPFS CIDs for decentralised web hosting).
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Text Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Text records are key-value pairs attached to a .dot name. They are commonly used for
        on-chain profiles &mdash; linking social accounts, websites, and descriptions to your
        identity.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Key</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Example Value</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Usage</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="record in textRecords" :key="record.key" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ record.key }}</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">
                {{ record.value }}
              </td>
              <td class="px-4 py-3 text-dot-text-secondary">{{ record.usage }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Reading and Writing Text Records</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Use <span class="font-mono text-dot-accent">setText</span> to store a text record and
        <span class="font-mono text-dot-accent">text</span> to read one. Only the name owner or an
        approved operator can write.
      </p>
      <DocCodeBlock :code="textRecordCode" lang="solidity" filename="DotnsContentResolver.sol" />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Content Hashes</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Content hashes point a .dot name at a decentralised website hosted on
        <span class="font-medium">IPFS</span>. The hash is stored as bytes using the multicodec
        format: <span class="font-mono text-dot-text-primary">0xe301</span> (IPFS namespace)
        followed by the CID multihash.
      </p>
      <DocCodeBlock :code="contentHashCode" lang="solidity" filename="content hash encoding" />
      <DocCallout variant="info" title="IPFS encoding">
        The <span class="font-mono">0xe301</span> prefix indicates an IPFS content hash using the
        multicodec standard. The remaining bytes are the CIDv1 multihash of your content. DotNS
        gateways use this to serve your website at <span class="font-mono">yourname.dot</span>.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Content Hash Functions</h2>
      <DocCodeBlock
        :code="contentHashFunctionsCode"
        lang="solidity"
        filename="DotnsContentResolver.sol"
      />
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Operator Approvals</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Name owners can approve third-party operators to manage their text records and content
        hashes. This lets an application or automated deployment pipeline update your profile or
        website content without needing your private key for every change.
      </p>
      <DocCodeBlock :code="operatorCode" lang="solidity" filename="operator approvals" />
      <DocCallout variant="warning" title="Security note">
        Approving an operator gives them write access to all text records and content hashes for
        your name. Only approve contracts and addresses you trust.
      </DocCallout>
    </div>

    <TryItSection title="Try it — Read a text record">
      <TryGetText />
    </TryItSection>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/reverse-resolution"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Reverse Resolution
      </RouterLink>
      <RouterLink
        to="/docs/protocol/proof-of-personhood"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Proof of Personhood &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryGetText from "@/components/docs/interactive/TryGetText.vue";

const textRecords = [
  { key: "twitter", value: "@alice_dot", usage: "Twitter/X handle" },
  { key: "github", value: "alice", usage: "GitHub username" },
  { key: "url", value: "https://alice.dot", usage: "Website URL" },
  { key: "description", value: "Builder on Polkadot", usage: "Short bio / description" },
];

const textRecordCode = `// Write a text record (owner or approved operator only)
function setText(bytes32 node, string calldata key, string calldata value) external;

// Read a text record (anyone)
function text(bytes32 node, string calldata key) external view returns (string memory);

// Example: Set a Twitter handle for alice.dot
contentResolver.setText(aliceNode, "twitter", "@alice_dot");

// Example: Read the Twitter handle
string memory twitter = contentResolver.text(aliceNode, "twitter");`;

const contentHashCode = `// Content hash format:
// 0xe301 + CIDv1 multihash bytes
//
// Example for an IPFS CID:
// CID: bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
// Encoded: 0xe30101701220...  (0xe301 prefix + dag-pb codec + sha256 hash)`;

const contentHashFunctionsCode = `// Set a content hash (owner or approved operator only)
function setContenthash(bytes32 node, bytes calldata hash) external;

// Read the content hash (anyone)
function contenthash(bytes32 node) external view returns (bytes memory);

// Example: Set IPFS content hash
bytes memory ipfsHash = hex"e30101701220..."; // encoded CID
contentResolver.setContenthash(aliceNode, ipfsHash);`;

const operatorCode = `// Approve an operator to manage your records
function approve(bytes32 node, address operator, bool approved) external;

// Check if an address is an approved operator
function isApprovedFor(bytes32 node, address owner, address operator)
    external view returns (bool);

// Example: Approve a CI/CD bot to update content hashes
contentResolver.approve(aliceNode, ciBot, true);`;
</script>
