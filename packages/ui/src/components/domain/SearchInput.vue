<template>
  <div class="relative font-sans">
    <div
      class="relative transition-all duration-300 flex items-center rounded-xl"
      :class="['border bg-dot-surface shadow-sm w-full', borderClass]"
    >
      <div class="flex items-center justify-center pl-4 pr-3 h-full">
        <Icon
          name="Search"
          size="md"
          :class="
            status === 'taken'
              ? 'text-error'
              : status === 'available'
                ? 'text-success'
                : 'text-dot-text-tertiary'
          "
        />
      </div>

      <div class="relative flex-1 flex items-center">
        <input
          v-model="searchQuery"
          @focus="isFocused = true"
          @blur="handleBlur"
          @input="handleInput"
          type="text"
          placeholder="Search for your dot handle..."
          class="w-full py-2.5 pr-16 text-sm bg-transparent border-none focus:outline-none placeholder-dot-text-tertiary transition-colors duration-200"
          :class="{
            'text-dot-text-primary': !status,
            'text-success placeholder-success/60': status === 'available',
            'text-error placeholder-error/60': status === 'taken',
          }"
        />
        <span
          class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none transition-colors duration-200"
          :class="{
            'text-dot-text-tertiary': !status,
            'text-success': status === 'available',
            'text-error': status === 'taken',
          }"
        >
          .dot
        </span>
      </div>

      <div class="absolute right-14 top-1/2 -translate-y-1/2">
        <Icon
          v-if="isLoading"
          name="Spinner"
          size="md"
          class="animate-spin text-dot-text-secondary"
        />

        <Icon v-else-if="status === 'available'" name="Check" size="lg" class="text-success" />

        <Icon
          v-else-if="status === 'taken' || validationError"
          name="X"
          size="lg"
          class="text-error"
        />
      </div>
    </div>

    <div
      v-if="validationError && !isLoading"
      class="mt-3 rounded-xl border border-error/40 bg-dot-surface p-4 text-left transition-all duration-200"
    >
      <span class="inline-flex items-center gap-1.5 text-sm font-medium text-error">
        <Icon name="X" size="sm" />
        Invalid name
      </span>
      <p class="mt-1 text-sm text-dot-text-secondary">{{ validationError }}</p>
    </div>

    <div
      v-else-if="status && !isLoading && userPopState"
      class="mt-3 rounded-xl border border-dot-border bg-dot-surface p-4 text-left space-y-3 transition-all duration-200"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="px-3 py-1 rounded-full text-xs font-bold"
          :class="tierClasses(userPopState.requirement)"
        >
          {{ tierLabel(userPopState.requirement) }}
        </span>
        <span class="text-sm font-medium text-dot-text-primary break-all">
          {{ searchQuery.trim().toLowerCase() }}.dot
        </span>
        <span
          class="sm:ml-auto inline-flex items-center gap-1.5 text-xs font-semibold"
          :class="status === 'available' ? 'text-success' : 'text-error'"
        >
          <Icon :name="status === 'available' ? 'Check' : 'X'" size="sm" />
          {{ status === "available" ? "Available" : "Taken" }}
        </span>
      </div>

      <p class="text-sm text-dot-text-secondary">{{ userPopState.message }}</p>

      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dot-text-tertiary">
        <span
          >Length:
          <span class="text-dot-text-primary">{{ searchQuery.trim().length }} chars</span></span
        >
        <span
          >Trailing digits:
          <span class="text-dot-text-primary">{{ trailingDigits(searchQuery) }}</span></span
        >
        <span v-if="myPopStatus !== null"
          >Your status:
          <span class="text-dot-text-primary font-medium">{{
            PopStatusLabels[myPopStatus]
          }}</span></span
        >
      </div>

      <div v-if="status === 'available'" class="flex items-center justify-end gap-3 pt-1">
        <p v-if="registerHint" class="text-xs text-dot-text-tertiary mr-auto">{{ registerHint }}</p>
        <Button variant="primary" size="sm" :disabled="!canRegister" @click="registerHandle">
          Register
        </Button>
      </div>
    </div>

    <RegisterModal
      :open="showModal"
      :handle="searchQuery"
      :userPopStatus="userPopState"
      @close="showModal = false"
      @wait="openWaitingModal"
    />
    <WaitingPeriod
      :open="showWaiting"
      :handle="searchQuery"
      :duration="waitingDuration"
      :onComplete="finalizeRegistration"
      @finalized="handleFinalized"
      @close="handleWaitingComplete"
    />
    <TransactionStatus
      :open="showTransaction"
      :handle="searchQuery"
      :transaction="transaction"
      @close="showTransaction = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import RegisterModal from "../RegisterModal.vue";
import WaitingPeriod from "./WaitingPeriod.vue";
import TransactionStatus from "../TransactionStatus.vue";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import { tierLabel, tierClasses } from "@/lib/docInteractiveHelpers";
import {
  type DotNSStatus,
  type TransactionResult,
  type NameRequirement,
  PopStatus,
  PopStatusLabels,
  type Registration,
} from "@/type";
import { zeroHash } from "viem";
import { useDomainStore, UNCLASSIFIABLE_MESSAGE } from "@/store/useDomainStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { useWalletStore } from "@/store/useWalletStore";
import { useMyPopStatus } from "@/composables";
import { isCanonicalLabel } from "@/utils";

const storeManager = useUserStoreManager();
const domainStore = useDomainStore();
const userWallet = useWalletStore();
const { popStatus: myPopStatus } = useMyPopStatus();

const searchQuery = ref("");
const isFocused = ref(false);
const isLoading = ref(false);
const status = ref<DotNSStatus | null>(null);
const userPopState = ref<NameRequirement | null>(null);
const validationError = ref<string | null>(null);

const showModal = ref(false);
const showWaiting = ref(false);
const showTransaction = ref(false);
const waitingDuration = ref(0);
const pendingRegistration = ref<Registration | null>(null);
const pendingDuration = ref<bigint>(0n);
const pendingGovernance = ref(false);
const transaction = ref<TransactionResult>({ hash: zeroHash, status: false });

let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  searchQuery,
  async (value) => {
    const label = value.trim();
    if (!label) {
      userPopState.value = null;
      status.value = null;
      validationError.value = null;
      isLoading.value = false;
      return;
    }
    if (!isCanonicalLabel(label)) {
      userPopState.value = null;
      status.value = null;
      validationError.value =
        "Names use lowercase letters, digits and hyphens only, with no dots or spaces.";
      isLoading.value = false;
      return;
    }
    validationError.value = null;
    isLoading.value = true;
    try {
      const classification = await domainStore.classifyName(label);
      userPopState.value = classification;
      if (classification.message === UNCLASSIFIABLE_MESSAGE) {
        status.value = null;
        validationError.value = "This name cannot be registered.";
        return;
      }
      const available = await storeManager.checkHandleAvailability(label);
      status.value = available.available ? "available" : "taken";
    } catch (err) {
      console.warn("Handle check failed:", err);
      status.value = null;
      userPopState.value = null;
      validationError.value = "This name cannot be registered.";
    } finally {
      isLoading.value = false;
    }
  },
  { flush: "post", deep: true },
);

function trailingDigits(value: string): number {
  const match = value.trim().match(/\d+$/);
  return match ? match[0].length : 0;
}

const meetsRequirement = computed(() => {
  const required = userPopState.value?.requirement;
  if (required === undefined || required === PopStatus.Reserved) return false;
  return myPopStatus.value !== null && myPopStatus.value >= required;
});

const canRegister = computed(
  () =>
    !validationError.value &&
    status.value === "available" &&
    userWallet.isConnected &&
    meetsRequirement.value,
);

const registerHint = computed(() => {
  if (!userWallet.isConnected) return "Connect your wallet to register";
  const required = userPopState.value?.requirement;
  if (required === undefined) return "";
  if (required === PopStatus.Reserved) return "Governance-reserved name";
  if (myPopStatus.value === null || myPopStatus.value < required) {
    return `Requires ${tierLabel(required)} verification`;
  }
  return "";
});

function registerHandle() {
  if (!canRegister.value) return;
  showModal.value = true;
}

function openWaitingModal(
  duration: bigint,
  waitTime: bigint,
  registration: Registration,
  governance: boolean,
) {
  showModal.value = false;
  waitingDuration.value = Number(waitTime);
  pendingDuration.value = BigInt(duration);
  pendingRegistration.value = registration;
  pendingGovernance.value = governance;
  setTimeout(() => (showWaiting.value = true), 400);
}

async function finalizeRegistration() {
  try {
    return pendingGovernance.value
      ? await domainStore.registerReserved(pendingRegistration.value!)
      : await domainStore.registerDomain(pendingRegistration.value!);
  } catch (error) {
    console.warn("Finalize registration failed:", error);
    return { status: false, hash: zeroHash };
  }
}

function handleFinalized(result: TransactionResult) {
  transaction.value = result;
  showTransaction.value = true;
}

function handleWaitingComplete() {
  showWaiting.value = false;
}

function handleInput() {
  clearTimeout(debounceTimer);
  if (!searchQuery.value.trim()) {
    isLoading.value = false;
    status.value = null;
    return;
  }
  isLoading.value = true;
  debounceTimer = setTimeout(() => {}, 300);
}

function handleBlur() {
  isFocused.value = false;
}

const borderClass = computed(() => {
  if (status.value === "available") return "border-success focus-within:border-success";
  if (status.value === "taken" || validationError.value)
    return "border-error focus-within:border-error";
  return "border-dot-border focus-within:border-dot-border-strong focus-within:ring-1 focus-within:ring-dot-border-strong";
});
</script>
