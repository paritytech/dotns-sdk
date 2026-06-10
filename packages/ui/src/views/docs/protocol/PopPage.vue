<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Proof of Personhood</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Proof of Personhood (PoP) is how DotNS keeps
        <span class="text-dot-text-primary font-medium">name distribution fair</span>. It stops one
        person or bot from hoarding thousands of names, and gates the shorter, more desirable names
        behind verification rather than price.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What is Proof of Personhood?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        PoP verifies that a person registering a name is a unique human, not a bot or a collection
        of fake wallets. DotNS connects to on-chain identity systems to place users into tiers. Each
        tier unlocks a different class of name &mdash; verified humans get access to shorter stems
        and register without a deposit.
      </p>
      <DocCallout variant="info" title="Why does this matter?">
        Without this protection, a single entity could register every short .dot name and resell
        them at inflated prices. PoP keeps desirable names available to real users and the namespace
        healthy and accessible.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">PoP Tiers</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every name falls into one of four tiers based on its length and trailing digit pattern. Your
        PoP status determines which tiers you can register from.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          v-for="tier in tiers"
          :key="tier.name"
          class="p-5 border rounded-xl transition-colors"
          :class="tier.borderClass"
        >
          <div class="flex items-center gap-2 mb-3">
            <span class="w-3 h-3 rounded-full" :class="tier.dotClass" />
            <p class="text-sm font-semibold text-dot-text-primary">{{ tier.name }}</p>
          </div>
          <p class="text-xs text-dot-text-secondary leading-relaxed mb-3">{{ tier.description }}</p>
          <div class="space-y-1">
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-secondary font-medium">Requires:</span> {{ tier.requires }}
            </p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-secondary font-medium">Pricing:</span> {{ tier.pricing }}
            </p>
            <p class="text-xs text-dot-text-tertiary">
              <span class="text-dot-text-secondary font-medium">Names:</span> {{ tier.names }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Classification Rules</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">PopRules</span> contract classifies each name
        based on two factors: the <span class="text-dot-text-primary font-medium">base length</span>
        (characters excluding trailing digits) and the
        <span class="text-dot-text-primary font-medium">number of trailing digits</span>.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Base Length</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">
                Trailing Digits
              </th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Classification</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="rule in classificationRules" :key="rule.id" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-text-primary text-xs">{{ rule.baseLen }}</td>
              <td class="px-4 py-3 font-mono text-dot-text-secondary text-xs">{{ rule.digits }}</td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                  :class="rule.badgeClass"
                >
                  {{ rule.classification }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="warning" title="Invalid names">
        A name's stem must carry either no trailing digits or exactly two. A single trailing digit
        or more than two are <span class="font-semibold">invalid</span> and cannot be registered
        through any path. This prevents numeric squatting patterns like
        <span class="font-mono">alice12345</span>.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Pricing (NoStatus tier)</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Registering a NoStatus-tier name (a stem of nine characters or more) costs a single flat
        deposit, the same amount whatever the name's length. The deposit is refundable: it is bound
        to the name, travels with it on transfer, and unlocks only when the holder releases the name
        back to escrow. Verified users (PopLite or PopFull) pay
        <span class="text-dot-text-primary font-medium">nothing</span> to register the names their
        tier allows.
      </p>
      <DocCallout variant="info" title="Length does not change the price">
        A shorter stem is not cheaper or dearer &mdash; it simply requires a higher tier. A stem of
        five characters or fewer is governance-reserved, six to eight needs proof of personhood, and
        nine or more is open to anyone for the flat NoStatus deposit.
      </DocCallout>
      <DocCallout variant="tip" title="Free for verified users">
        PopLite and PopFull users pay <strong>nothing</strong> to register any name their tier
        allows. Verification, not payment, is what unlocks the shorter stems.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How the deposit is priced</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">PopRules</span> contract prices a name from the
        caller's tier, not its length. The flat amount is
        <span class="font-mono text-dot-accent">startingPrice</span>, set at deployment and
        updatable by governance.
      </p>
      <div
        class="p-4 rounded-lg border border-dot-border bg-dot-surface font-mono text-xs leading-relaxed text-dot-text-secondary space-y-1"
      >
        <p>price = 0 &mdash; PopLite / PopFull users</p>
        <p>price = startingPrice (flat) &mdash; NoStatus user on a NoStatus-tier name</p>
      </div>

      <DocCallout variant="info" title="Design rationale">
        <ul class="list-disc list-inside space-y-1 text-sm">
          <li>
            A flat per-name deposit caps Sybil cost at one deposit per live NoStatus name, however
            often names change hands.
          </li>
          <li>The deposit is refundable on release to escrow, not a burned fee.</li>
          <li>
            Proof of personhood waives the deposit entirely, so verified humans register free.
          </li>
          <li>
            <span class="font-mono text-dot-accent">startingPrice</span> is upgradeable &mdash;
            governance can adjust it without redeploying.
          </li>
        </ul>
      </DocCallout>
    </div>

    <TryItSection title="Try it — Will a transfer pay a fee?">
      <TryTransferMatrix />
    </TryItSection>

    <TryItSection title="Try it — Classify a name">
      <TryClassifyName />
    </TryItSection>

    <TryItSection title="Try it — Check your PoP status" :requires-wallet="true">
      <TryPopStatus />
    </TryItSection>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">How Classification Works</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">PopRules</span> contract analyses each name
        label by splitting it into a
        <span class="text-dot-text-primary font-medium">base part</span> (the letters before any
        numbers at the end) and
        <span class="text-dot-text-primary font-medium">trailing digits</span> (the numbers at the
        end). The combination determines the classification.
      </p>
      <DocCodeBlock :code="classificationCode" lang="solidity" filename="PopRules.sol" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Examples</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p>
            <span class="text-dot-accent">alice</span> &rarr; stemlen=5, digits=0 &rarr;
            <span class="text-warning">Reserved</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie</span> &rarr; stemlen=7, digits=0 &rarr;
            <span class="text-success">PopFull</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie42</span> &rarr; stemlen=7, digits=2 &rarr;
            <span class="text-dot-accent">PopLite</span>
          </p>
          <p>
            <span class="text-dot-accent">longername</span> &rarr; stemlen=10, digits=0 &rarr;
            <span class="text-dot-text-secondary">NoStatus</span>
          </p>
          <p>
            <span class="text-dot-accent">longername99</span> &rarr; stemlen=10, digits=2 &rarr;
            <span class="text-dot-text-secondary">NoStatus</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie1</span> &rarr; stemlen=7, digits=1 &rarr;
            <span class="text-error">Invalid (one trailing digit)</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie123</span> &rarr; stemlen=7, digits=3 &rarr;
            <span class="text-error">Invalid (&gt;2 digits)</span>
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">PoP Precompile</h2>
      <div
        class="flex items-center justify-center py-16 border border-dot-border rounded-lg bg-dot-surface"
      >
        <p class="text-dot-text-tertiary text-sm">Coming soon</p>
      </div>
    </div>

    <div class="border-t border-dot-border pt-6 flex justify-between text-sm">
      <RouterLink
        to="/docs/protocol/content"
        class="text-dot-text-tertiary hover:text-dot-text-primary"
      >
        &larr; Content &amp; Profiles
      </RouterLink>
      <RouterLink
        to="/docs/protocol/subdomains"
        class="text-dot-accent hover:text-dot-accent-hover"
      >
        Subdomains &rarr;
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import DocCallout from "@/components/docs/DocCallout.vue";
import DocCodeBlock from "@/components/docs/DocCodeBlock.vue";
import TryItSection from "@/components/docs/TryItSection.vue";
import TryClassifyName from "@/components/docs/interactive/TryClassifyName.vue";
import TryPopStatus from "@/components/docs/interactive/TryPopStatus.vue";
import TryTransferMatrix from "@/components/docs/interactive/TryTransferMatrix.vue";

const tiers = [
  {
    name: "NoStatus",
    description:
      "Default tier for unverified users. Can register names with a stem of nine characters or more, for a single flat refundable deposit.",
    requires: "No verification needed",
    pricing: "Flat refundable deposit (startingPrice)",
    names: "9+ char stem, with no trailing digits or exactly two",
    borderClass: "border-dot-border bg-dot-surface",
    dotClass: "bg-dot-text-tertiary",
  },
  {
    name: "PopLite",
    description:
      "Basic proof of personhood. Grants access to names with a 6-8 character stem and exactly two trailing digits at zero cost.",
    requires: "Basic PoP verification",
    pricing: "Free (0 DOT)",
    names: "6-8 char stem with exactly two trailing digits",
    borderClass: "border-dot-accent/30 bg-dot-accent-soft",
    dotClass: "bg-dot-accent",
  },
  {
    name: "PopFull",
    description:
      "Full proof of personhood. Grants access to premium names with a 6-8 character stem and no trailing digits at zero cost.",
    requires: "Full PoP verification",
    pricing: "Free (0 DOT)",
    names: "6-8 char stem, no trailing digits",
    borderClass: "border-success/30 bg-success/5",
    dotClass: "bg-success",
  },
  {
    name: "Reserved",
    description:
      "Names with 5 or fewer base characters. Cannot be registered through the normal flow — governance approval only.",
    requires: "Governance authorisation",
    pricing: "Governance-determined",
    names: "1-5 char base (e.g. alice, bob, dot)",
    borderClass: "border-warning/30 bg-warning/5",
    dotClass: "bg-warning",
  },
];

const classificationRules = [
  {
    id: 1,
    baseLen: "<= 5",
    digits: "any",
    classification: "Reserved",
    badgeClass: "bg-warning/10 text-warning",
  },
  {
    id: 2,
    baseLen: "6 - 8",
    digits: "0",
    classification: "PopFull",
    badgeClass: "bg-success/10 text-success",
  },
  {
    id: 3,
    baseLen: "6 - 8",
    digits: "exactly 2",
    classification: "PopLite",
    badgeClass: "bg-dot-accent/10 text-dot-accent",
  },
  {
    id: 4,
    baseLen: ">= 9",
    digits: "0",
    classification: "NoStatus",
    badgeClass: "bg-dot-surface-secondary text-dot-text-secondary",
  },
  {
    id: 5,
    baseLen: ">= 9",
    digits: "exactly 2",
    classification: "NoStatus",
    badgeClass: "bg-dot-surface-secondary text-dot-text-secondary",
  },
  {
    id: 6,
    baseLen: "any",
    digits: "1, or > 2",
    classification: "Invalid",
    badgeClass: "bg-error/10 text-error",
  },
];

const classificationCode = `// PopRules classification logic (simplified)
function classify(string calldata label) external pure returns (Status) {
    (uint256 stemLen, uint256 trailingDigits) = _analyse(label);

    // Trailing digits must be zero or exactly two
    if (trailingDigits == 1 || trailingDigits > 2) revert InvalidName();
    if (stemLen <= 5)        return Status.Reserved;

    if (stemLen >= 9)        return Status.NoStatus; // zero or two digits
    // stemLen is 6-8 from here

    if (trailingDigits == 0) return Status.PopFull;
    return Status.PopLite;   // stem 6-8 with exactly two digits
}`;
</script>
