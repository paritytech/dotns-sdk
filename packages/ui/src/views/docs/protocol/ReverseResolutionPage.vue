<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Reverse Resolution</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Reverse resolution converts an
        <span class="text-dot-text-primary font-medium">address</span> back to its primary
        <span class="text-dot-text-primary font-medium">.dot name</span>. This is what lets wallets
        and apps show <span class="font-mono text-dot-accent">alice.dot</span> instead of a long hex
        address.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How Reverse Resolution Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">DotnsReverseResolver</span> contract stores a
        mapping from addresses to their primary .dot name. It has one read function:
      </p>
      <DocCodeBlock
        :code="reverseResolverCode"
        lang="solidity"
        filename="DotnsReverseResolver.sol"
      />
      <p class="text-dot-text-secondary leading-relaxed">
        If the address has a primary name set, it returns the label string (e.g.
        <span class="font-mono text-dot-text-primary">"alice"</span>). If no reverse record exists,
        it returns an empty string.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">When Is the Reverse Record Set?</h2>
      <div class="space-y-3">
        <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
          <p class="text-sm font-medium text-dot-text-primary">Automatic (during registration)</p>
          <p class="text-xs text-dot-text-secondary mt-1">
            When a name is registered with
            <span class="font-mono text-dot-accent">reserved = true</span>
            in the registration options, the Controller sets the reverse record for the owner's
            address automatically. The address displays the new .dot name straight away.
          </p>
        </div>
        <div class="p-4 border border-dot-border rounded-lg bg-dot-surface">
          <p class="text-sm font-medium text-dot-text-primary">Manual (after registration)</p>
          <p class="text-xs text-dot-text-secondary mt-1">
            Users who own multiple .dot names can change their primary name by calling
            <span class="font-mono text-dot-accent">setName</span> on the ReverseResolver directly.
            Only the address owner can set their own reverse record.
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Usage Examples</h2>
      <DocCodeBlock :code="solidityExample" lang="solidity" filename="ReverseExample.sol" />
      <DocCodeBlock :code="tsExample" lang="typescript" filename="reverse.ts" />
    </div>

    <DocCallout variant="tip" title="Display pattern">
      The common UX pattern is: try <span class="font-mono">nameOf(address)</span> first. If it
      returns a non-empty string, display the .dot name. Otherwise, fall back to displaying the
      truncated hex address.
    </DocCallout>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Forward vs. Reverse</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Direction</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Contract</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Function</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Input</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Output</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Forward</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">DotnsResolver</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">addressOf(node)</td>
              <td class="px-4 py-3 text-dot-text-secondary">Name (as node hash)</td>
              <td class="px-4 py-3 text-dot-text-secondary">Address</td>
            </tr>
            <tr class="bg-dot-surface">
              <td class="px-4 py-3 text-dot-text-primary">Reverse</td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">
                DotnsReverseResolver
              </td>
              <td class="px-4 py-3 text-dot-text-secondary font-mono text-xs">nameOf(address)</td>
              <td class="px-4 py-3 text-dot-text-secondary">Address</td>
              <td class="px-4 py-3 text-dot-text-secondary">Name (as string)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <TryItSection title="Try it — Reverse resolve an address">
      <TryReverseResolve />
    </TryItSection>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/resolution"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Resolution
      </RouterLink>
      <RouterLink to="/docs/protocol/content" class="text-dot-accent hover:text-dot-accent-hover">
        Content &amp; Profiles &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryReverseResolve from "@/components/docs/interactive/TryReverseResolve.vue";

const reverseResolverCode = `// DotnsReverseResolver — Reverse resolution
function nameOf(address addr) external view returns (string memory) {
    // Returns the primary .dot label for this address
    // Returns "" if no reverse record is set
}`;

const solidityExample = `contract DisplayName {
    IDotnsReverseResolver public reverseResolver;

    function getDisplayName(address user) external view returns (string memory) {
        string memory name = reverseResolver.nameOf(user);
        // If name is empty, the address has no primary .dot name
        return bytes(name).length > 0 ? string.concat(name, ".dot") : "";
    }
}`;

const tsExample = `// Reverse resolve an address to its primary .dot name
const label = await reverseResolver.nameOf("0x1234...abcd");

if (label) {
  console.log(\`Display name: \${label}.dot\`);
} else {
  console.log("No primary .dot name set for this address");
}`;
</script>
