<template>
  <div
    v-if="!wallet.isConnected"
    class="border border-dot-border rounded-xl bg-dot-surface p-8 text-center"
  >
    <h3 class="text-sm font-medium text-dot-text-primary mb-1">Wallet not connected</h3>
    <p class="text-dot-text-tertiary text-sm">
      Connect your wallet to view escrow deposits and refunds.
    </p>
  </div>

  <div v-else class="space-y-8">
    <section>
      <div class="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 class="text-sm font-semibold text-dot-text-primary">Name deposits</h2>
          <p class="text-dot-text-tertiary text-xs">
            Release a name to start its cooldown, withdraw the deposit, then claim your balance.
          </p>
          <p class="text-dot-text-secondary text-xs mt-1">
            Total in escrow:
            <span class="text-dot-text-primary font-medium">
              {{ formatWeiAsEther(totalInEscrow) }} PAS
            </span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button size="sm" variant="secondary" :disabled="isLoadingPositions" @click="refresh">
            {{ isLoadingPositions ? "Refreshing..." : "Refresh" }}
          </Button>
        </div>
      </div>

      <div
        v-if="isLoadingPositions"
        class="border border-dot-border rounded-xl p-8 animate-pulse space-y-4"
      >
        <div class="h-4 bg-dot-border rounded w-1/3" />
        <div class="h-4 bg-dot-border rounded w-1/2" />
      </div>

      <div
        v-else-if="positions.length === 0"
        class="border border-dot-border rounded-xl bg-dot-surface p-8 text-center"
      >
        <div
          class="w-10 h-10 mx-auto mb-3 rounded-full bg-dot-surface-secondary flex items-center justify-center"
        >
          <Icon name="Clock" size="md" class="text-dot-text-tertiary" />
        </div>
        <h3 class="text-sm font-medium text-dot-text-primary mb-1">No name deposits</h3>
        <p class="text-dot-text-tertiary text-sm max-w-sm mx-auto">
          Names registered without verification hold a refundable deposit that appears here.
        </p>
      </div>

      <div v-else class="border border-dot-border rounded-xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-dot-border text-sm">
            <thead class="bg-dot-surface-secondary">
              <tr>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Name
                </th>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Deposit
                </th>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Status
                </th>
                <th
                  class="px-4 py-2.5 text-right text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dot-border bg-dot-surface">
              <tr
                v-for="p in positions"
                :key="p.domain"
                class="hover:bg-dot-surface-secondary transition-colors duration-150"
              >
                <td class="px-4 py-2.5 font-medium text-dot-text-primary break-all">
                  {{ p.domain }}.dot
                </td>
                <td class="px-4 py-2.5 text-dot-text-secondary">
                  {{ formatWeiAsEther(p.amount) }} PAS
                </td>
                <td class="px-4 py-2.5">
                  <span class="inline-flex items-center gap-1">
                    <span :class="positionStatusClass(p)">{{ positionStatusLabel(p) }}</span>
                    <span
                      v-if="isNonRefundable(p)"
                      :title="NON_REFUNDABLE_HINT"
                      class="cursor-help text-dot-text-tertiary"
                    >
                      <Icon name="Info" size="sm" />
                    </span>
                  </span>
                </td>
                <td class="px-4 py-2.5 text-right">
                  <span
                    v-if="isNonRefundable(p) && !p.released"
                    class="text-xs text-dot-text-tertiary"
                  >
                    No refund
                  </span>
                  <Button
                    v-else-if="!p.released"
                    size="sm"
                    variant="secondary"
                    :disabled="busyId === p.domain"
                    @click="onRelease(p.domain)"
                  >
                    {{ busyId === p.domain ? "Releasing..." : "Release" }}
                  </Button>
                  <span v-else-if="p.claimed" class="text-xs text-dot-text-tertiary">Claimed</span>
                  <span v-else-if="!isWithdrawable(p)" class="text-xs text-dot-text-tertiary">
                    Claimable in {{ cooldownText(p) }}
                  </span>
                  <Button
                    v-else
                    size="sm"
                    :disabled="busyId === p.domain"
                    @click="onClaim(p.domain)"
                  >
                    {{ busyId === p.domain ? "Claiming..." : "Claim" }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <div class="mb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 class="text-sm font-semibold text-dot-text-primary">Refund ledger</h2>
          <p class="text-dot-text-tertiary text-xs">
            Transfer-fee overpayments, each claimable after its own cooldown.
          </p>
        </div>
        <Button
          size="sm"
          :disabled="busyId === 'batch' || claimableEntryIds.length === 0"
          @click="onClaimBatch"
        >
          {{ busyId === "batch" ? "Claiming..." : `Claim eligible (${claimableEntryIds.length})` }}
        </Button>
      </div>

      <div
        v-if="isLoadingRefunds"
        class="border border-dot-border rounded-xl p-8 animate-pulse space-y-4"
      >
        <div class="h-4 bg-dot-border rounded w-2/5" />
        <div class="h-4 bg-dot-border rounded w-1/3" />
      </div>

      <div
        v-else-if="refunds.length === 0"
        class="border border-dot-border rounded-xl bg-dot-surface p-8 text-center"
      >
        <div
          class="w-10 h-10 mx-auto mb-3 rounded-full bg-dot-surface-secondary flex items-center justify-center"
        >
          <Icon name="Clock" size="md" class="text-dot-text-tertiary" />
        </div>
        <h3 class="text-sm font-medium text-dot-text-primary mb-1">No pending refunds</h3>
        <p class="text-dot-text-tertiary text-sm max-w-sm mx-auto">
          Transfer-fee overpayments owed to you appear here, claimable after a cooldown.
        </p>
      </div>

      <div v-else class="border border-dot-border rounded-xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-dot-border text-sm">
            <thead class="bg-dot-surface-secondary">
              <tr>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Entry
                </th>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Amount
                </th>
                <th
                  class="px-4 py-2.5 text-left text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Status
                </th>
                <th
                  class="px-4 py-2.5 text-right text-xs uppercase tracking-wider font-semibold text-dot-text-secondary"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dot-border bg-dot-surface">
              <tr
                v-for="entry in refunds"
                :key="entry.entryId.toString()"
                class="hover:bg-dot-surface-secondary transition-colors duration-150"
              >
                <td class="px-4 py-2.5 font-mono text-xs text-dot-text-secondary">
                  #{{ entry.entryId }}
                </td>
                <td class="px-4 py-2.5 text-dot-text-secondary">
                  {{ formatWeiAsEther(entry.amount) }} PAS
                </td>
                <td class="px-4 py-2.5">
                  <span :class="refundStatusClass(entry)">{{ refundStatusLabel(entry) }}</span>
                </td>
                <td class="px-4 py-2.5 text-right">
                  <Button
                    size="sm"
                    :disabled="busyId === refundKey(entry) || !isRefundClaimable(entry)"
                    @click="onClaimRefund(entry.entryId)"
                  >
                    {{ busyId === refundKey(entry) ? "Claiming..." : "Claim" }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePagination
          v-model="refundPage"
          :total-items="Number(refundTotal)"
          :page-size="refundPageSize"
          item-label="refund"
          @update:page-size="refundPageSize = $event"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useToast } from "vue-toastification";
import Button from "@/components/ui/Button.vue";
import Icon from "@/components/ui/Icon.vue";
import TablePagination from "@/components/ui/TablePagination.vue";
import { useWalletStore } from "@/store/useWalletStore";
import { useEscrowStore, type EscrowPosition, type RefundEntry } from "@/store/useEscrowStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { type Address } from "viem";
import { formatWeiAsEther } from "@/utils";
import { isRegistrableDotName } from "@/lib/domain";
import {
  isWithdrawable as isWithdrawableAt,
  positionStatusLabel as positionStatusLabelAt,
  isRefundClaimable as isRefundClaimableAt,
  isRefundableDeposit,
  cooldownRemainingSeconds,
  formatCooldown,
  totalEscrowAmount,
} from "@/lib/escrowStatus";

// Shown on names whose escrow position holds no deposit: paid for by another
// account, or registered under a free personhood tier. There is no bond to reclaim.
const NON_REFUNDABLE_HINT =
  "This name holds no refundable deposit. It was either paid for by another account or registered under a free personhood tier, so there is no bond for you to reclaim.";

const wallet = useWalletStore();
const escrow = useEscrowStore();
const userStore = useUserStoreManager();
const toast = useToast();

const isLoadingPositions = ref(false);
const isLoadingRefunds = ref(false);
const busyId = ref<string | null>(null);
const positions = ref<EscrowPosition[]>([]);
const refunds = ref<RefundEntry[]>([]);
const refundTotal = ref<bigint>(0n);
const refundPage = ref(1);
const refundPageSize = ref(10);

// Ticks every second so cooldown countdowns and status labels stay live.
const now = ref(0n);
let cooldownTimer: ReturnType<typeof setInterval> | undefined;

function syncNow(): void {
  now.value = BigInt(Math.floor(Date.now() / 1000));
}

onMounted(() => {
  syncNow();
  cooldownTimer = setInterval(syncNow, 1000);
});

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});

function isWithdrawable(position: EscrowPosition): boolean {
  return isWithdrawableAt(position, now.value);
}

function positionStatusLabel(position: EscrowPosition): string {
  return positionStatusLabelAt(position, now.value);
}

function cooldownText(position: EscrowPosition): string {
  return formatCooldown(cooldownRemainingSeconds(position, now.value));
}

function isNonRefundable(position: EscrowPosition): boolean {
  return !isRefundableDeposit(position);
}

function positionStatusClass(position: EscrowPosition): string {
  const label = positionStatusLabel(position);
  if (label === "Withdrawable") return "text-success font-medium";
  if (label === "Cooldown" || label === "Not refundable") return "text-dot-text-tertiary";
  return "text-dot-text-secondary";
}

function refundKey(entry: RefundEntry): string {
  return `refund:${entry.entryId}`;
}

function isRefundClaimable(entry: RefundEntry): boolean {
  return isRefundClaimableAt(entry, now.value);
}

function refundStatusLabel(entry: RefundEntry): string {
  return isRefundClaimable(entry) ? "Claimable" : "Cooldown";
}

function refundStatusClass(entry: RefundEntry): string {
  return isRefundClaimable(entry) ? "text-success font-medium" : "text-dot-text-tertiary";
}

const claimableEntryIds = computed(() =>
  refunds.value.filter(isRefundClaimable).map((entry) => entry.entryId),
);

const totalInEscrow = computed(() => totalEscrowAmount(positions.value));

async function loadPositions(): Promise<void> {
  const recipient = wallet.evmAddress as Address | undefined;
  if (!recipient) {
    positions.value = [];
    return;
  }
  isLoadingPositions.value = true;
  try {
    const names = await userStore.getSubdomainsForAddress(recipient);
    positions.value = await escrow.listAccountPositions(
      recipient,
      names.filter(isRegistrableDotName),
    );
  } finally {
    isLoadingPositions.value = false;
  }
}

async function loadRefunds(): Promise<void> {
  const recipient = wallet.evmAddress;
  if (!recipient) {
    refunds.value = [];
    refundTotal.value = 0n;
    return;
  }
  isLoadingRefunds.value = true;
  try {
    const offset = (refundPage.value - 1) * refundPageSize.value;
    const ledger = await escrow.listRefunds(recipient, offset, refundPageSize.value);
    refunds.value = ledger.entries;
    refundTotal.value = ledger.total;
  } finally {
    isLoadingRefunds.value = false;
  }
}

async function refresh(): Promise<void> {
  if (!wallet.isConnected) return;
  syncNow();
  try {
    await Promise.all([loadPositions(), loadRefunds()]);
  } catch (error) {
    console.warn("[EscrowTab] refresh failed", error);
    toast.error("Could not load escrow data.");
  }
}

async function runAction(
  id: string,
  action: () => Promise<unknown>,
  success: string,
): Promise<void> {
  if (busyId.value) return;
  busyId.value = id;
  try {
    await action();
    toast.success(success);
    await refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(message);
  } finally {
    busyId.value = null;
  }
}

function onRelease(domain: string): void {
  void runAction(domain, () => escrow.release(domain), "Name released into escrow.");
}

function onClaim(domain: string): void {
  void runAction(domain, () => escrow.withdrawAndClaim(domain), "Deposit claimed.");
}

function onClaimRefund(entryId: bigint): void {
  void runAction(`refund:${entryId}`, () => escrow.claimRefund(entryId), "Refund claimed.");
}

function onClaimBatch(): void {
  const ids = claimableEntryIds.value;
  if (ids.length === 0) return;
  void runAction("batch", () => escrow.claimRefundsBatch(ids), "Refunds claimed.");
}

watch(() => wallet.evmAddress, refresh, { immediate: true });
watch([refundPage, refundPageSize], loadRefunds);
</script>
