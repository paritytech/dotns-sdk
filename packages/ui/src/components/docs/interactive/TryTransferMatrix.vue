<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Pick the PoP tier the name requires, then read off whether a transfer is free</label
          >
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tier in USER_TIERS"
              :key="tier"
              type="button"
              @click="requiredTier = tier"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-dot-accent/30"
              :class="
                requiredTier === tier
                  ? 'border-dot-accent bg-dot-accent-soft text-dot-accent'
                  : 'border-dot-border bg-dot-surface text-dot-text-secondary hover:text-dot-text-primary'
              "
            >
              {{ tierLabel(tier) }}
            </button>
          </div>
        </div>

        <div class="w-full overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <caption class="sr-only">
              Transfer cost by sender tier (rows) and recipient tier (columns)
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  class="p-2 text-left text-xs font-medium text-dot-text-tertiary align-bottom"
                >
                  sender &darr; / recipient &rarr;
                </th>
                <th
                  v-for="toTier in USER_TIERS"
                  :key="`h-${toTier}`"
                  scope="col"
                  class="p-2 text-center text-xs font-semibold text-dot-text-secondary"
                >
                  {{ shortTierLabel(toTier) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="fromTier in USER_TIERS" :key="`r-${fromTier}`">
                <th
                  scope="row"
                  class="p-2 text-left text-xs font-semibold text-dot-text-secondary whitespace-nowrap"
                >
                  {{ shortTierLabel(fromTier) }}
                </th>
                <td v-for="toTier in USER_TIERS" :key="`c-${fromTier}-${toTier}`" class="p-1">
                  <div
                    class="rounded-lg border px-2 py-2 text-center"
                    :class="
                      cell(fromTier, toTier).paysFloor
                        ? 'border-warning/30 bg-warning/10'
                        : 'border-success/30 bg-success/10'
                    "
                  >
                    <p
                      class="text-xs font-bold"
                      :class="cell(fromTier, toTier).paysFloor ? 'text-warning' : 'text-success'"
                    >
                      {{ cell(fromTier, toTier).paysFloor ? "Pays floor" : "Free" }}
                    </p>
                    <p
                      v-if="cell(fromTier, toTier).reason"
                      class="text-[10px] text-dot-text-tertiary mt-0.5"
                    >
                      {{ cell(fromTier, toTier).reason }}
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap gap-4 text-xs text-dot-text-tertiary">
          <span class="flex items-center gap-1.5">
            <span
              class="inline-block w-3 h-3 rounded border border-success/30 bg-success/10"
            ></span>
            Free transfer
          </span>
          <span class="flex items-center gap-1.5">
            <span
              class="inline-block w-3 h-3 rounded border border-warning/30 bg-warning/10"
            ></span>
            Charges the transfer floor
          </span>
        </div>

        <p class="text-xs text-dot-text-secondary leading-relaxed">
          A transfer charges the floor when the recipient is
          <span class="text-dot-text-primary">below the name's required tier</span> (a reach miss)
          or <span class="text-dot-text-primary">a lower tier than the sender</span> (a downgrade).
          When the recipient clears both, the transfer is free. Governance-reserved names sit above
          every verified tier, so they always charge the floor.
        </p>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="cliCode" lang="bash" filename="transfer.sh" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { tierLabel } from "@/lib/docInteractiveHelpers";
import { transferFeeOutcome, type PopTier, type TransferFeeOutcome } from "@/lib/transferFee";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

// Users only ever hold one of these three personhood tiers (NoStatus, PopLite,
// PopFull). Reserved is a name requirement, never a user tier, so it is excluded.
const USER_TIERS: readonly PopTier[] = [0, 1, 2];

const requiredTier = ref<PopTier>(0);

const SHORT_TIER_LABELS: Record<PopTier, string> = { 0: "None", 1: "Lite", 2: "Full" };

function shortTierLabel(tier: PopTier): string {
  return SHORT_TIER_LABELS[tier];
}

function cell(fromTier: PopTier, toTier: PopTier): TransferFeeOutcome {
  return transferFeeOutcome(requiredTier.value, fromTier, toTier);
}

const cliCode = `# A transfer is free when the recipient meets the name's required PoP tier and
# is not a downgrade from the sender. Otherwise it charges the transfer floor.

# The CLI quotes the fee before sending (DotnsRegistrar.quoteTransferFee):
dotns lookup transfer alice --destination bob.dot

# Under the hood (PopRules.transferFloor(name, from, to)):
#   floor = max(
#     toTier >= required ? 0 : startingPrice,   # reach: recipient below name's required tier
#     toTier >= fromTier ? 0 : startingPrice,   # downgrade: recipient lower tier than sender
#   )
# Sending less than the quoted floor reverts with TransferFeeRequired.`;
</script>
