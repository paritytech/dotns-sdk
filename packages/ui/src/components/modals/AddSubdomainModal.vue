<template>
  <Modal :open="open" size="md" :busy="isSubmitting" @close="handleClose">
    <div class="font-sans text-dot-text-primary">
      <h2 class="text-2xl font-bold text-dot-text-primary text-center mb-1">Add Subdomain</h2>
      <p class="text-dot-text-tertiary text-sm text-center mb-6">
        Register a new subdomain under one of your owned .dot domains.
      </p>

      <div class="mb-4">
        <label class="text-sm font-semibold text-dot-text-secondary block mb-2">
          Choose parent domain
        </label>
        <div class="relative">
          <select
            v-model="selectedTLD"
            class="w-full border border-dot-border rounded-xl py-2 pl-4 pr-10 text-dot-text-secondary text-sm appearance-none focus:ring-2 focus:ring-dot-accent/20 focus:outline-none"
          >
            <option v-for="(tld, idx) in normalizedTLDs" :key="idx" :value="tld">
              {{ tld }}.dot
            </option>
          </select>

          <Icon
            name="ChevronDown"
            size="sm"
            class="absolute right-[14px] top-1/2 -translate-y-1/2 text-dot-text-tertiary pointer-events-none"
          />
        </div>
      </div>

      <div class="mb-4">
        <label class="text-sm font-semibold text-dot-text-secondary block mb-2">
          Subdomain name
        </label>
        <div class="relative">
          <div class="flex items-center justify-center absolute left-4 top-1/2 -translate-y-1/2">
            <Icon
              v-if="isCheckingAvailability"
              name="Spinner"
              size="md"
              class="animate-spin text-dot-text-secondary"
            />
            <Icon
              v-else-if="status === 'available' && subdomain.trim()"
              name="Check"
              size="md"
              class="text-success"
            />
            <Icon
              v-else-if="status === 'taken' && subdomain.trim()"
              name="X"
              size="md"
              class="text-error"
            />
            <Icon v-else name="Search" size="md" class="text-dot-text-tertiary" />
          </div>

          <input
            v-model="subdomain"
            @input="debouncedCheck"
            type="text"
            placeholder="Enter subdomain..."
            class="w-full py-3 pl-12 pr-4 border rounded-xl text-dot-text-primary focus:outline-none placeholder-dot-text-tertiary transition-all duration-200"
            :class="subdomainBorderClass"
          />
        </div>
      </div>

      <div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <label class="text-sm font-semibold text-dot-text-secondary"> Owner address </label>
          <div class="relative group/info">
            <svg
              class="w-4 h-4 text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div
              class="invisible group-hover/info:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-64 z-10"
            >
              <p class="mb-1">
                Enter a .dot name, EVM address (0x...), or Substrate address (5...)
              </p>
              <p>Leave empty to own the subdomain yourself</p>
              <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                <div class="border-4 border-transparent border-t-gray-900"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="relative">
          <input
            v-model="ownerInput"
            type="text"
            placeholder="Leave empty for self-ownership"
            class="w-full px-4 py-2 rounded-lg focus:outline-none transition-all duration-200"
            :class="ownerBorderClass"
          />

          <div class="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              v-if="isResolvingOwner"
              class="animate-spin h-5 w-5 text-dot-text-secondary"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>

            <svg
              v-else-if="ownerInput && resolvedOwner && wasResolved"
              class="h-6 w-6 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>

            <svg
              v-else-if="ownerInput && ownerResolutionError"
              class="h-6 w-6 text-error"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>

        <div v-if="ownerStatusMessage" class="mt-2">
          <p
            class="text-sm font-medium transition-all duration-200"
            :class="resolvedOwner ? 'text-success' : 'text-error'"
          >
            {{ ownerStatusMessage }}
          </p>
        </div>
      </div>

      <div v-if="subdomain.trim()" class="mb-6">
        <p class="text-xs text-dot-text-tertiary mb-1">Full domain:</p>
        <p
          class="text-sm font-mono font-medium transition-all duration-200"
          :class="{
            'text-success': status === 'available',
            'text-error': status === 'taken',
            'text-dot-text-secondary': !status,
          }"
          :title="fullDomain"
        >
          {{ truncatedDomain }}
        </p>
      </div>

      <div
        v-if="status && !isCheckingAvailability && subdomain.trim()"
        class="text-center text-sm font-medium mb-6 transition-all duration-200"
      >
        <span v-if="status === 'available'" class="text-success">
          ✓ Available for registration
        </span>
        <span v-else class="text-error"> ✗ Already taken </span>
      </div>

      <div class="flex justify-end gap-3">
        <Button variant="outline" @click="handleClose"> Cancel </Button>
        <Button
          variant="primary"
          @click="confirmAdd"
          :disabled="!canRegister"
          :loading="isSubmitting"
        >
          <span v-if="!isSubmitting">Register</span>
          <span v-else>Processing...</span>
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { DotNSStatus, TransactionResult } from "../../type";
import { useDomainStore } from "@/store/useDomainStore";
import { useWalletStore } from "@/store/useWalletStore";
import { useAddressResolver } from "@/composables/useAddressResolver";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Modal from "@/components/ui/Modal.vue";
import { zeroHash, type Address } from "viem";

const props = defineProps<{ open: boolean; tlds: string[] }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "registered", payload: TransactionResult): void;
}>();

const domainStore = useDomainStore();
const wallet = useWalletStore();

const subdomain = ref("");
const selectedTLD = ref<string | undefined>("");
const status = ref<DotNSStatus | null>(null);
const isCheckingAvailability = ref(false);
const isSubmitting = ref(false);

const ownerInput = ref("");

// Use address resolver composable with default address
const {
  resolvedAddress: resolvedOwner,
  isResolving: isResolvingOwner,
  error: ownerResolutionError,
  wasResolved,
} = useAddressResolver(ownerInput, {
  defaultAddress: wallet.evmAddress as Address,
});

import { normalizeDomains } from "@/composables/useDomainValidation";

const normalizedTLDs = computed(() => normalizeDomains(props.tlds));

watch(
  normalizedTLDs,
  (newList) => {
    if (newList.length > 0 && !selectedTLD.value) {
      selectedTLD.value = newList[0];
    }
  },
  { immediate: true },
);

const isBusy = computed(() => isSubmitting.value || wallet.isLoading || isResolvingOwner.value);

const fullDomain = computed(() =>
  subdomain.value.trim() && selectedTLD.value ? `${subdomain.value}.${selectedTLD.value}.dot` : "",
);

const truncatedDomain = computed(() => {
  const domain = fullDomain.value;
  if (!domain) return "";

  const maxLength = 45;

  if (domain.length <= maxLength) {
    return domain;
  }

  const parts = domain.split(".");
  if (parts.length < 3) return domain;

  const subdomainPart = parts[0];
  const parentPart = parts.slice(1).join(".");

  if (subdomainPart && subdomainPart.length > 10) {
    const start = subdomainPart.slice(0, 10);
    const end = subdomainPart.slice(-5);
    return `${start}...${end}.${parentPart}`;
  }

  return domain;
});

const subdomainBorderClass = computed(() => {
  if (!subdomain.value.trim()) {
    return "border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
  }
  if (status.value === "available") {
    return "border-success focus:border-success";
  }
  if (status.value === "taken") {
    return "border-error focus:border-error";
  }
  return "border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
});

const ownerBorderClass = computed(() => {
  if (!ownerInput.value) {
    return "border border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
  }
  if (resolvedOwner.value) {
    return "border border-success focus:border-success bg-dot-surface";
  }
  if (ownerResolutionError.value) {
    return "border border-error focus:border-error bg-dot-surface";
  }
  return "border border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
});

const ownerStatusMessage = computed(() => {
  if (ownerResolutionError.value) {
    return `✗ ${ownerResolutionError.value}`;
  }
  if (resolvedOwner.value && wasResolved.value) {
    return `✓ Resolved: ${resolvedOwner.value}`;
  }
  return "";
});

const canRegister = computed(() => {
  return (
    subdomain.value.trim() &&
    status.value === "available" &&
    !isBusy.value &&
    !isCheckingAvailability.value &&
    (ownerInput.value ? resolvedOwner.value && !ownerResolutionError.value : true)
  );
});

let debounceTimer: number | NodeJS.Timeout;
const debouncedCheck = () => {
  clearTimeout(debounceTimer);
  status.value = null;

  if (!subdomain.value.trim()) {
    isCheckingAvailability.value = false;
    return;
  }

  isCheckingAvailability.value = true;
  debounceTimer = setTimeout(checkAvailability, 600);
};

async function checkAvailability() {
  let name = subdomain.value.trim();
  if (!name) {
    isCheckingAvailability.value = false;
    status.value = null;
    return;
  }

  try {
    const exists = await domainStore.recordExists(selectedTLD.value!, name);
    status.value = exists ? "taken" : "available";
  } catch (error) {
    console.warn("Availability check failed:", error);
    status.value = "taken";
  } finally {
    isCheckingAvailability.value = false;
  }
}

function handleClose() {
  if (!isSubmitting.value) {
    emit("close");
  }
}

async function confirmAdd() {
  if (!canRegister.value) return;

  const owner = resolvedOwner.value || (wallet.evmAddress as Address);
  if (!owner) {
    console.error("Could not resolve owner address");
    return;
  }

  try {
    isSubmitting.value = true;
    const txHash = await domainStore.registerSubDomain(
      selectedTLD.value as string,
      subdomain.value,
      owner,
    );
    emit("registered", { hash: txHash, status: txHash !== zeroHash });
  } catch (err) {
    console.warn("Subdomain registration failed:", err);
    emit("registered", { hash: zeroHash, status: false });
  } finally {
    isSubmitting.value = false;
    emit("close");
  }
}

watch(selectedTLD, () => {
  if (subdomain.value.trim()) {
    status.value = null;
    checkAvailability();
  }
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resolvedOwner.value = wallet.evmAddress as Address;
    } else {
      subdomain.value = "";
      ownerInput.value = "";
      status.value = null;
      resolvedOwner.value = null;
      ownerResolutionError.value = "";
      wasResolved.value = false;
      isCheckingAvailability.value = false;
      isSubmitting.value = false;
      isResolvingOwner.value = false;
    }
  },
);
</script>
