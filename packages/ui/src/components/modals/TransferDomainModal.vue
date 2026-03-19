<template>
  <Modal
    :open="open"
    size="md"
    :busy="isTransferring"
    close-label="Close transfer modal"
    @close="closeModal"
  >
    <div>
      <h2 class="text-2xl font-bold text-dot-text-primary mb-2">Transfer Domain</h2>

      <p class="text-dot-text-tertiary text-sm mb-6">
        Transfer ownership of your domain to another address
      </p>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-dot-text-secondary mb-2">
            Select Domain
          </label>
          <select
            v-model="selectedDomain"
            class="w-full border border-dot-border bg-dot-surface text-dot-text-primary rounded-lg px-4 py-2 focus:ring-2 focus:ring-dot-accent/20 focus:outline-none"
            :disabled="isTransferring"
          >
            <option value="">Choose a domain...</option>
            <option v-for="domain in domains" :key="domain" :value="domain">
              {{ domain }}
            </option>
          </select>
        </div>

        <div>
          <div class="flex items-center gap-2 mb-2">
            <label class="text-sm font-medium text-dot-text-secondary"> Recipient</label>
            <div class="relative group/info">
              <Icon
                name="Info"
                size="sm"
                class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
              />
              <div
                class="invisible group-hover/info:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg w-64 z-10"
              >
                <p class="mb-1">
                  Enter a .dot name, EVM address (0x...), or Substrate address (5...)
                </p>
                <p>.dot names will be looked up in the registry to find the owner's address</p>
                <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                  <div class="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <input
              v-model="recipientInput"
              type="text"
              placeholder="alice.dot or 0x... or 5..."
              class="w-full px-4 py-2 rounded-lg focus:outline-none transition-all duration-200 text-dot-text-primary bg-dot-surface placeholder:text-dot-text-tertiary"
              :class="inputBorderClass"
              :disabled="isTransferring"
            />

            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <Icon
                v-if="isResolving"
                name="Spinner"
                size="md"
                class="animate-spin text-dot-text-secondary"
              />

              <Icon
                v-else-if="recipientInput && resolvedAddress && wasResolved"
                name="Check"
                size="lg"
                class="text-success"
              />

              <Icon
                v-else-if="recipientInput && resolutionError"
                name="X"
                size="lg"
                class="text-error"
              />
            </div>
          </div>

          <div v-if="statusMessage" class="mt-2">
            <p
              class="text-sm font-medium transition-all duration-200"
              :class="resolvedAddress ? 'text-success' : 'text-error'"
            >
              {{ statusMessage }}
            </p>
          </div>
        </div>

        <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div class="flex items-start gap-2">
            <svg
              class="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p class="text-sm font-semibold text-amber-400">Warning: This action is permanent</p>
              <p class="text-xs text-amber-500 mt-1">
                Transferring this domain means you will lose ownership and control. The new owner
                will have full rights to the domain and all its subdomains.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Button
        size="lg"
        variant="primary"
        full-width
        class="mt-6"
        @click="handleTransfer"
        :disabled="!selectedDomain || !resolvedAddress || isTransferring || !!resolutionError"
        :loading="isTransferring"
      >
        <span v-if="!isTransferring">Transfer Domain</span>
        <span v-else>Transferring...</span>
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { type Address, type Hash } from "viem";
import { useToast } from "vue-toastification";
import { useDomainStore } from "@/store/useDomainStore";
import { useAddressResolver } from "@/composables/useAddressResolver";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Modal from "@/components/ui/Modal.vue";

const props = defineProps<{
  open: boolean;
  domains: string[];
}>();

const emit = defineEmits<{
  close: [];
  transferred: [domain: string, recipient: Address, receipt: Hash];
}>();

const domainStore = useDomainStore();
const toaster = useToast();

const selectedDomain = ref("");
const recipientInput = ref("");
const isTransferring = ref(false);

// Use address resolver composable
const {
  resolvedAddress,
  isResolving,
  error: resolutionError,
  wasResolved,
} = useAddressResolver(recipientInput);

const inputBorderClass = computed(() => {
  if (!recipientInput.value) {
    return "border border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
  }
  if (resolvedAddress.value) {
    return "border border-success focus:border-success bg-dot-surface";
  }
  if (resolutionError.value) {
    return "border border-error focus:border-error bg-dot-surface";
  }
  return "border border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
});

const statusMessage = computed(() => {
  if (resolutionError.value) {
    return `✗ ${resolutionError.value}`;
  }
  if (resolvedAddress.value && wasResolved.value) {
    return `✓ Resolved: ${resolvedAddress.value}`;
  }
  return "";
});

async function handleTransfer() {
  if (!selectedDomain.value || !resolvedAddress.value) return;

  try {
    isTransferring.value = true;

    const txHash = await domainStore.transferDomain(selectedDomain.value, resolvedAddress.value);

    toaster.success(`Domain transferred successfully!`);
    emit("transferred", selectedDomain.value, resolvedAddress.value, txHash);
    closeModal();
  } catch (error) {
    console.warn("Transfer error:", error);
    toaster.error(error instanceof Error ? error.message : "Failed to transfer domain");
  } finally {
    isTransferring.value = false;
  }
}

function closeModal() {
  if (!isTransferring.value) {
    selectedDomain.value = "";
    recipientInput.value = "";
    resolvedAddress.value = null;
    resolutionError.value = "";
    wasResolved.value = false;
    emit("close");
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      selectedDomain.value = "";
      recipientInput.value = "";
      resolvedAddress.value = null;
      resolutionError.value = "";
      isResolving.value = false;
      wasResolved.value = false;
    }
  },
);
</script>
