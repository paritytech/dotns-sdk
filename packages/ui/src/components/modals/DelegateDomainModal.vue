<template>
  <Modal
    :open="open"
    size="md"
    :busy="isSubmitting"
    close-label="Close delegate modal"
    @close="closeModal"
  >
    <div>
      <h2 class="text-xl font-bold text-dot-text-primary mb-2">Delegate {{ domain }}</h2>

      <p class="text-dot-text-tertiary text-sm mb-6">
        Grant another address control of this name without giving up ownership. Revoke any time.
      </p>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-dot-text-secondary mb-1.5">
            Delegation type
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="option in GRANT_OPTIONS"
              :key="option.value"
              type="button"
              :disabled="isSubmitting"
              @click="grant = option.value"
              class="text-left rounded-lg border px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-dot-accent/30 disabled:opacity-50"
              :class="
                grant === option.value
                  ? 'border-dot-accent bg-dot-accent-soft'
                  : 'border-dot-border bg-dot-surface hover:border-dot-border-strong'
              "
            >
              <span class="block text-sm font-semibold text-dot-text-primary">{{
                option.title
              }}</span>
              <span class="block text-xs text-dot-text-tertiary mt-0.5">{{ option.scope }}</span>
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-dot-border bg-dot-surface p-3">
          <p class="text-xs text-dot-text-secondary leading-relaxed">{{ activeOption.note }}</p>
        </div>

        <div
          v-if="grant === 'name' && currentDelegate"
          class="rounded-lg border border-dot-border bg-dot-surface px-3 py-2 flex items-center justify-between gap-2"
        >
          <span class="text-xs text-dot-text-secondary truncate">
            Currently delegated to
            <span class="text-dot-text-primary font-mono">{{ currentDelegate }}</span>
          </span>
          <Button size="sm" variant="secondary" :disabled="isSubmitting" @click="handleRevokeName">
            Revoke
          </Button>
        </div>

        <div>
          <label class="block text-xs font-medium text-dot-text-secondary mb-1.5"
            >Delegate to</label
          >
          <div class="relative">
            <input
              v-model="delegateInput"
              type="text"
              placeholder="alice.dot or 0x... or 5..."
              class="w-full px-3 h-9 rounded-lg focus:outline-none transition-all duration-200 text-sm text-dot-text-primary bg-dot-surface placeholder:text-dot-text-tertiary"
              :class="inputBorderClass"
              :disabled="isSubmitting"
            />
            <div class="absolute right-3 top-1/2 -translate-y-1/2">
              <Icon
                v-if="isResolving"
                name="Spinner"
                size="md"
                class="animate-spin text-dot-text-secondary"
              />
              <Icon
                v-else-if="delegateInput && resolvedAddress && wasResolved"
                name="Check"
                size="lg"
                class="text-success"
              />
              <Icon
                v-else-if="delegateInput && resolutionError"
                name="X"
                size="lg"
                class="text-error"
              />
            </div>
          </div>
          <p
            v-if="statusMessage"
            class="mt-2 text-sm font-medium"
            :class="resolvedAddress ? 'text-success' : 'text-error'"
          >
            {{ statusMessage }}
          </p>
        </div>
      </div>

      <Button
        size="md"
        variant="primary"
        full-width
        class="mt-6"
        :disabled="!resolvedAddress || isSubmitting || !!resolutionError"
        :loading="isSubmitting"
        @click="handleDelegate"
      >
        <span v-if="!isSubmitting">{{ activeOption.action }}</span>
        <span v-else>Submitting...</span>
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { zeroAddress, type Address } from "viem";
import { useToast } from "vue-toastification";
import { useDomainStore } from "@/store/useDomainStore";
import { useAddressResolver } from "@/composables/useAddressResolver";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import Modal from "@/components/ui/Modal.vue";

type GrantType = "name" | "records";

type GrantOption = {
  value: GrantType;
  title: string;
  scope: string;
  note: string;
  action: string;
};

const GRANT_OPTIONS: GrantOption[] = [
  {
    value: "name",
    title: "Full control of this name",
    scope: "Manage and transfer",
    note: "The delegate can manage and transfer this name. The grant is revoked automatically if the name is transferred, and you can revoke it manually at any time.",
    action: "Delegate this name",
  },
  {
    value: "records",
    title: "Record editing",
    scope: "All your names",
    note: "Account-wide and record-scoped: the delegate can edit text and contenthash records for every name you hold, but cannot transfer a name or change its owner.",
    action: "Grant record access",
  },
];

const props = defineProps<{
  open: boolean;
  domain: string;
}>();

const emit = defineEmits<{
  close: [];
  delegated: [domain: string];
}>();

const domainStore = useDomainStore();
const toaster = useToast();

const grant = ref<GrantType>("name");
const delegateInput = ref("");
const isSubmitting = ref(false);
const currentDelegate = ref<Address | null>(null);

const {
  resolvedAddress,
  isResolving,
  error: resolutionError,
  wasResolved,
} = useAddressResolver(delegateInput);

const activeOption = computed(
  () => GRANT_OPTIONS.find((option) => option.value === grant.value) ?? GRANT_OPTIONS[0]!,
);

const inputBorderClass = computed(() => {
  if (resolvedAddress.value) return "border border-success focus:border-success bg-dot-surface";
  if (delegateInput.value && resolutionError.value)
    return "border border-error focus:border-error bg-dot-surface";
  return "border border-dot-border focus:border-dot-border-strong focus:ring-2 focus:ring-dot-accent/20";
});

const statusMessage = computed(() => {
  if (resolutionError.value) return `✗ ${resolutionError.value}`;
  if (resolvedAddress.value && wasResolved.value) return `✓ Resolved: ${resolvedAddress.value}`;
  return "";
});

async function loadCurrentDelegate(): Promise<void> {
  currentDelegate.value = props.domain ? await domainStore.getNameDelegate(props.domain) : null;
}

async function handleDelegate(): Promise<void> {
  if (!resolvedAddress.value) return;
  try {
    isSubmitting.value = true;
    if (grant.value === "name") {
      await domainStore.setNameDelegate(props.domain, resolvedAddress.value);
    } else {
      await domainStore.setRecordDelegate(resolvedAddress.value, true);
    }
    toaster.success("Delegation updated");
    emit("delegated", props.domain);
    closeModal();
  } catch (error) {
    toaster.error(error instanceof Error ? error.message : "Failed to delegate");
  } finally {
    isSubmitting.value = false;
  }
}

async function handleRevokeName(): Promise<void> {
  try {
    isSubmitting.value = true;
    await domainStore.setNameDelegate(props.domain, zeroAddress);
    toaster.success("Delegation revoked");
    emit("delegated", props.domain);
    closeModal();
  } catch (error) {
    toaster.error(error instanceof Error ? error.message : "Failed to revoke");
  } finally {
    isSubmitting.value = false;
  }
}

function closeModal(): void {
  if (isSubmitting.value) return;
  delegateInput.value = "";
  resolvedAddress.value = null;
  resolutionError.value = "";
  wasResolved.value = false;
  emit("close");
}

watch(
  () => [props.open, props.domain, grant.value] as const,
  ([isOpen]) => {
    if (isOpen && grant.value === "name") loadCurrentDelegate();
    else currentDelegate.value = null;
  },
  { immediate: true },
);
</script>
