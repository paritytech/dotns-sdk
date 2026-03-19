<template>
  <div class="space-y-8">
    <div>
      <p class="text-sm font-medium text-dot-accent mb-2">Protocol</p>
      <h1 class="text-4xl font-serif text-dot-text-primary mb-4">Proof of Personhood</h1>
      <p class="text-lg text-dot-text-secondary leading-relaxed">
        Proof of Personhood (PoP) is DotNS's mechanism for
        <span class="text-dot-text-primary font-medium">fair name distribution</span>. It prevents
        Sybil attacks (one entity hoarding thousands of names) so that shorter, more desirable names
        are priced fairly based on who is registering them.
      </p>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">What is Proof of Personhood?</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        PoP is a way to verify that a registrant is a unique human, not a bot or a wallet farm.
        DotNS integrates with on-chain identity systems to classify users into tiers. Each tier
        opens up different name lengths and pricing &mdash; verified humans get access to shorter
        names and lower (or zero) registration fees.
      </p>
      <DocCallout variant="info" title="Why does this matter?">
        Without Sybil resistance, a single entity could register every short .dot name and resell
        them at inflated prices. PoP keeps desirable names distributed to real users at fair prices,
        and the namespace healthy and accessible.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">PoP Tiers</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Every name is classified into one of four tiers based on its length and trailing digit
        pattern. Your PoP status determines which tiers you can register from.
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
        Names with more than 2 trailing digits are considered
        <span class="font-semibold">invalid</span> and cannot be registered through any path. This
        prevents numeric squatting patterns like <span class="font-mono">alice12345</span>.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Pricing (NoStatus Tier)</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        Users without PoP verification (NoStatus) pay a length-based registration fee. The shorter
        the name, the higher the price. Users with PoP verification (PopLite or PopFull) pay
        <span class="text-dot-text-primary font-medium">zero registration fees</span>.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-dot-border rounded-lg overflow-hidden">
          <thead>
            <tr class="bg-dot-surface-secondary">
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Name Length</th>
              <th class="text-left px-4 py-3 text-dot-text-tertiary font-medium">Price (DOT)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dot-border">
            <tr v-for="price in pricingTable" :key="price.length" class="bg-dot-surface">
              <td class="px-4 py-3 font-mono text-dot-text-primary text-xs">{{ price.length }}</td>
              <td class="px-4 py-3 font-mono text-dot-accent text-xs">{{ price.price }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <DocCallout variant="tip" title="Free for verified users">
        PoP-verified users (PopLite and PopFull) pay <strong>0 DOT</strong> for registration. Get
        verified to get free name registration for all names your tier allows.
      </DocCallout>
    </div>

    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-dot-text-primary">Fee Formula</h2>
      <p class="text-dot-text-secondary leading-relaxed">
        The <span class="font-mono text-dot-accent">PopRules</span> contract computes registration
        prices using a piecewise linear formula. The
        <span class="font-mono text-dot-accent">startingPrice</span> (currently 0.002 DOT) is set at
        deployment and can be updated by governance.
      </p>
      <div
        class="p-4 rounded-lg border border-dot-border bg-dot-surface font-mono text-xs leading-relaxed text-dot-text-secondary whitespace-pre"
      >
        price(n) = 0 if n &lt; 9 (PoP-gated) = startingPrice &times; (15 &minus; n) if 9 &le; n &le;
        14 = startingPrice &divide; 2 if n &ge; 15 (floor)
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium text-dot-text-primary">Worked example</p>
        <div
          class="p-4 rounded-lg border border-dot-border bg-dot-surface font-mono text-xs leading-relaxed text-dot-text-secondary whitespace-pre"
        >
          startingPrice = 0.002 DOT name = "domainname" &rarr; length = 10 multiplier = 15 &minus;
          10 = 5 price = 0.002 &times; 5 = <span class="text-dot-accent font-bold">0.010 DOT</span>
        </div>
      </div>

      <DocCallout variant="info" title="Design rationale">
        <ul class="list-disc list-inside space-y-1 text-sm">
          <li>Linear decay makes shorter names more expensive, deterring name squatting.</li>
          <li>The floor price keeps long names affordable but not free.</li>
          <li>PoP bypasses fees entirely, providing Sybil resistance via identity verification.</li>
          <li>
            <span class="font-mono text-dot-accent">startingPrice</span> is upgradeable &mdash;
            governance can adjust the slope without redeploying.
          </li>
        </ul>
      </DocCallout>
    </div>

    <TryItSection title="Try it — Pricing curve">
      <TryPricingCurve />
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
        <span class="text-dot-text-primary font-medium">base part</span> (non-digit prefix) and
        <span class="text-dot-text-primary font-medium">trailing digits</span>. The combination
        determines the classification.
      </p>
      <DocCodeBlock :code="classificationCode" lang="solidity" filename="PopRules.sol" />
      <div class="p-4 border border-dot-border rounded-lg bg-dot-surface space-y-3">
        <p class="text-sm font-medium text-dot-text-primary">Examples</p>
        <div class="space-y-2 text-xs font-mono text-dot-text-secondary">
          <p>
            <span class="text-dot-accent">alice</span> &rarr; baselen=5, digits=0 &rarr;
            <span class="text-warning">Reserved</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie</span> &rarr; baselen=7, digits=0 &rarr;
            <span class="text-success">PopFull</span>
          </p>
          <p>
            <span class="text-dot-accent">charlie42</span> &rarr; baselen=7, digits=2 &rarr;
            <span class="text-dot-accent">PopLite</span>
          </p>
          <p>
            <span class="text-dot-accent">longername</span> &rarr; baselen=10, digits=0 &rarr;
            <span class="text-success">PopFull</span>
          </p>
          <p>
            <span class="text-dot-accent">longername99</span> &rarr; baselen=10, digits=2 &rarr;
            <span class="text-dot-text-secondary">NoStatus</span>
          </p>
          <p>
            <span class="text-dot-accent">name12345</span> &rarr; baselen=4, digits=5 &rarr;
            <span class="text-error">Invalid (&gt;2 digits)</span>
          </p>
        </div>
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
import TryPricingCurve from "@/components/docs/interactive/TryPricingCurve.vue";

const tiers = [
  {
    name: "NoStatus",
    description:
      "Default tier for unverified users. Can register longer names with trailing digits, but must pay a length-based fee.",
    requires: "No verification needed",
    pricing: "Length-based fee (0.001 - 0.012 DOT)",
    names: "9+ char base with 2 trailing digits",
    borderClass: "border-dot-border bg-dot-surface",
    dotClass: "bg-dot-text-tertiary",
  },
  {
    name: "PopLite",
    description:
      "Basic proof of personhood. Grants access to names with 6-8 character base and 2 trailing digits at zero cost.",
    requires: "Basic PoP verification",
    pricing: "Free (0 DOT)",
    names: "6-8 char base with 2 trailing digits",
    borderClass: "border-dot-accent/30 bg-dot-accent-soft",
    dotClass: "bg-dot-accent",
  },
  {
    name: "PopFull",
    description:
      "Full proof of personhood. Grants access to premium names with 6+ character base and no trailing digits at zero cost.",
    requires: "Full PoP verification",
    pricing: "Free (0 DOT)",
    names: "6+ char base, no trailing digits",
    borderClass: "border-success/30 bg-success/5",
    dotClass: "bg-success",
  },
  {
    name: "Reserved",
    description:
      "Names with 5 or fewer base characters. Cannot be registered through normal flow — governance only.",
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
    digits: "1 - 2",
    classification: "PopLite",
    badgeClass: "bg-dot-accent/10 text-dot-accent",
  },
  {
    id: 4,
    baseLen: ">= 9",
    digits: "0",
    classification: "PopFull",
    badgeClass: "bg-success/10 text-success",
  },
  {
    id: 5,
    baseLen: ">= 9",
    digits: "1 - 2",
    classification: "NoStatus",
    badgeClass: "bg-dot-surface-secondary text-dot-text-secondary",
  },
  {
    id: 6,
    baseLen: "any",
    digits: "> 2",
    classification: "Invalid",
    badgeClass: "bg-error/10 text-error",
  },
];

const pricingTable = [
  { length: "9 characters", price: "0.012 DOT" },
  { length: "10 characters", price: "0.010 DOT" },
  { length: "11 characters", price: "0.008 DOT" },
  { length: "12 characters", price: "0.006 DOT" },
  { length: "13 characters", price: "0.004 DOT" },
  { length: "14 characters", price: "0.002 DOT" },
  { length: ">= 15 characters", price: "0.001 DOT" },
];

const classificationCode = `// PopRules classification logic (simplified)
function classify(string calldata label) external pure returns (Status) {
    (uint256 baselen, uint256 trailingDigits) = _analyse(label);

    if (trailingDigits > 2) revert InvalidName();
    if (baselen <= 5)       return Status.Reserved;

    if (trailingDigits == 0) return Status.PopFull;
    // trailingDigits is 1 or 2 from here

    if (baselen <= 8)       return Status.PopLite;
    // baselen >= 9 with 1-2 trailing digits
    return Status.NoStatus;
}`;
</script>
