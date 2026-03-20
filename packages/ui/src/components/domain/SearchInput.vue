<template>
  <div class="relative font-sans">
    <div
      class="relative transition-all duration-300 flex items-center rounded-2xl"
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
          class="w-full py-4 pr-16 text-lg bg-transparent border-none focus:outline-none placeholder-dot-text-tertiary transition-colors duration-200"
          :class="{
            'text-dot-text-primary': !status,
            'text-success placeholder-success/60': status === 'available',
            'text-error placeholder-error/60': status === 'taken',
          }"
        />
        <span
          class="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-medium pointer-events-none transition-colors duration-200"
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

        <Icon v-else-if="status === 'taken'" name="X" size="lg" class="text-error" />
      </div>
    </div>

    <div v-if="status && !isLoading" class="mt-[2%] text-center transition-all duration-200">
      <p
        class="text-sm font-medium mb-3"
        :class="status === 'available' ? 'text-success' : 'text-error'"
      >
        {{ statusMessage }}
      </p>

      <Button
        v-if="status === 'available' && canRegister"
        variant="primary"
        size="lg"
        @click="registerHandle"
      >
        Register Handle
      </Button>
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

    <AuthorizeStoreModal
      v-if="authGuard.showAuthModal.value"
      :open="authGuard.showAuthModal.value"
      :contracts="authGuard.authStatuses.value"
      :loading="authGuard.authLoading.value"
      :progress="authGuard.authProgress.value"
      :error="authGuard.authError.value"
      @close="authGuard.handleAuthClose"
      @submit="authGuard.handleAuthSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import RegisterModal from "../RegisterModal.vue";
import WaitingPeriod from "./WaitingPeriod.vue";
import TransactionStatus from "../TransactionStatus.vue";
import AuthorizeStoreModal from "../modals/AuthorizeStoreModal.vue";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import { useStoreAuthGuard } from "@/composables/useStoreAuthGuard";
import {
  type DotNSStatus,
  type TransactionResult,
  type NameRequirement,
  PopStatus,
  type Registration,
} from "@/type";
import { zeroHash } from "viem";
import { useDomainStore } from "@/store/useDomainStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { canRegisterWithStatus } from "@/utils";
import { useWalletStore } from "@/store/useWalletStore";

const storeManager = useUserStoreManager();
const domainStore = useDomainStore();
const userWallet = useWalletStore();
const authGuard = useStoreAuthGuard();

const searchQuery = ref("");
const isFocused = ref(false);
const isLoading = ref(false);
const status = ref<DotNSStatus | null>(null);
const userPopState = ref<NameRequirement | null>(null);

const showModal = ref(false);
const showWaiting = ref(false);
const showTransaction = ref(false);
const waitingDuration = ref(0);
const pendingRegistration = ref<Registration | null>(null);
const pendingDuration = ref<bigint>(0n);
const transaction = ref<TransactionResult>({ hash: zeroHash, status: false });

let debounceTimer: ReturnType<typeof setTimeout>;

watch(
  searchQuery,
  async (value) => {
    if (!value.trim()) {
      userPopState.value = null;
      status.value = null;
      return;
    }
    isLoading.value = true;
    try {
      userPopState.value = await domainStore.classifyName(value);
      const available = await storeManager.checkHandleAvailability(value);
      status.value = available.available ? "available" : "taken";
    } catch (err) {
      console.warn("Handle check failed:", err);
      status.value = "taken";
      userPopState.value = {
        requirement: PopStatus.Reserved,
        message: "This handle is invalid, all handles can have max 2 suffixed digits.",
      };
    } finally {
      isLoading.value = false;
    }
  },
  { flush: "post", deep: true },
);

const statusMessage = computed(() => {
  if (!userPopState.value || !status.value) return "";
  const popStatus = userPopState.value;
  const availability =
    status.value === "available" ? "Handle is available" : "Handle is already taken";
  return `${availability} — ${popStatus.message}`;
});

const canRegister = computed(() => {
  if (!userPopState.value || !searchQuery.value.trim()) return false;
  return (
    canRegisterWithStatus(searchQuery.value, userPopState.value.requirement) &&
    userWallet.isConnected
  );
});

function registerHandle() {
  if (!canRegister.value) return;
  authGuard.checkAuthAndProceed(() => {
    showModal.value = true;
  });
}

function openWaitingModal(duration: bigint, waitTime: bigint, registration: Registration) {
  showModal.value = false;
  waitingDuration.value = Number(waitTime);
  pendingDuration.value = BigInt(duration);
  pendingRegistration.value = registration;
  setTimeout(() => (showWaiting.value = true), 400);
}

async function finalizeRegistration() {
  try {
    const hash = await domainStore.registerDomain(pendingRegistration.value!);
    return hash;
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
  if (status.value === "taken") return "border-error focus-within:border-error";
  return "border-dot-border focus-within:border-dot-border-strong focus-within:ring-2 focus-within:ring-dot-accent/20";
});
</script>
