<template>
  <Modal :open="open" size="md" :busy="loading" @close="handleClose">
    <div>
      <h2 class="text-xl font-bold text-dot-text-primary mb-2">Manage Contract Access</h2>
      <p class="text-sm text-dot-text-secondary mb-5">
        Control which DotNS contracts have write access to your Store. Toggle each contract to
        authorize or revoke access.
      </p>

      <ul class="space-y-3 mb-4">
        <li
          v-for="(contract, idx) in localState"
          :key="contract.address"
          class="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors duration-150"
          :class="
            contract.authorized
              ? 'border-success/30 bg-success/5'
              : 'border-dot-border bg-dot-surface-secondary'
          "
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-dot-text-primary">{{ contract.name }}</p>
            <p class="text-xs font-mono text-dot-text-tertiary truncate">{{ contract.address }}</p>
          </div>
          <Toggle
            :model-value="contract.authorized"
            :disabled="loading"
            @update:model-value="setContractState(idx, $event)"
          />
        </li>
      </ul>

      <div class="flex items-center justify-between mb-6">
        <div class="flex gap-2">
          <button
            class="text-xs font-medium text-dot-accent hover:text-dot-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading || allAuthorized"
            @click="authorizeAll"
          >
            Authorize All
          </button>
          <span class="text-dot-text-tertiary text-xs">|</span>
          <button
            class="text-xs font-medium text-dot-text-secondary hover:text-dot-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading || noneAuthorized"
            @click="unauthorizeAll"
          >
            Unauthorize All
          </button>
        </div>
        <span v-if="changeCount > 0" class="text-xs text-dot-accent">
          {{ changeCount }} change{{ changeCount > 1 ? "s" : "" }}
        </span>
      </div>

      <p v-if="progress" class="text-xs text-dot-accent mb-4 text-center animate-pulse">
        {{ progress }}
      </p>

      <p v-if="error" class="text-xs text-error mb-4 text-center">
        {{ error }}
      </p>

      <div class="flex gap-3">
        <Button variant="secondary" full-width :disabled="loading" @click="handleClose">
          Cancel
        </Button>
        <Button
          variant="primary"
          full-width
          :loading="loading"
          :disabled="loading || changeCount === 0"
          @click="handleSubmit"
        >
          Submit ({{ changeCount }})
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { ContractAuthStatus } from "@/type";
import type { Address } from "viem";
import Modal from "@/components/ui/Modal.vue";
import Button from "@/components/ui/Button.vue";
import Toggle from "@/components/ui/Toggle.vue";

type ContractToggleState = {
  name: string;
  address: Address;
  authorized: boolean;
};

const props = defineProps<{
  open: boolean;
  contracts: ContractAuthStatus[];
  loading: boolean;
  progress: string;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [changes: { address: Address; authorize: boolean }[]];
}>();

const localState = ref<ContractToggleState[]>([]);
const initialState = ref<Map<Address, boolean>>(new Map());

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      syncFromProps();
    }
  },
  { immediate: true },
);

watch(
  () => props.contracts,
  () => {
    if (props.open) {
      syncFromProps();
    }
  },
  { deep: true },
);

function syncFromProps() {
  localState.value = props.contracts.map((c) => ({
    name: c.name,
    address: c.address,
    authorized: c.authorized,
  }));
  initialState.value = new Map(props.contracts.map((c) => [c.address, c.authorized]));
}

function setContractState(idx: number, authorized: boolean) {
  const entry = localState.value[idx];
  if (entry) {
    entry.authorized = authorized;
  }
}

function authorizeAll() {
  for (const c of localState.value) {
    c.authorized = true;
  }
}

function unauthorizeAll() {
  for (const c of localState.value) {
    c.authorized = false;
  }
}

const allAuthorized = computed(() => localState.value.every((c) => c.authorized));
const noneAuthorized = computed(() => localState.value.every((c) => !c.authorized));

const changes = computed(() => {
  const result: { address: Address; authorize: boolean }[] = [];
  for (const c of localState.value) {
    const original = initialState.value.get(c.address);
    if (original !== c.authorized) {
      result.push({ address: c.address, authorize: c.authorized });
    }
  }
  return result;
});

const changeCount = computed(() => changes.value.length);

function handleSubmit() {
  if (changes.value.length > 0) {
    emit("submit", changes.value);
  }
}

function handleClose() {
  if (!props.loading) {
    emit("close");
  }
}
</script>
