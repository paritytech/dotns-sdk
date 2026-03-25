<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        @click.self="handleClose"
      >
        <Transition
          enter-active-class="transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          enter-from-class="scale-95 opacity-0 translate-y-6"
          enter-to-class="scale-100 opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="scale-100 opacity-100 translate-y-0"
          leave-to-class="scale-95 opacity-0 translate-y-4"
        >
          <div
            v-if="open"
            class="bg-dot-surface border border-dot-border rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center relative"
          >
            <button
              class="absolute top-5 right-5 transition-colors"
              :class="
                isPending
                  ? 'text-dot-text-tertiary/30 cursor-not-allowed'
                  : 'text-dot-text-tertiary hover:text-dot-text-primary cursor-pointer'
              "
              :disabled="isPending"
              @click="handleClose"
              aria-label="Close transaction status"
            >
              <Icon name="X" size="md" />
            </button>

            <template v-if="transaction && status === 'pending'">
              <GradientLoader size="md" class="mx-auto mb-6" />

              <h2 class="text-xl font-semibold text-dot-text-primary mb-2">
                Submitting Transaction
              </h2>
              <p class="text-dot-text-tertiary text-sm mb-4">
                Your transaction is being finalized. Please wait...
              </p>

              <Transition
                enter-active-class="transition-opacity duration-300"
                enter-from-class="opacity-0"
              >
                <div v-if="elapsed > 15" class="text-sm text-dot-text-secondary">
                  Taking longer than usual.
                  <a
                    v-if="explorerUrl"
                    :href="explorerUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-dot-accent hover:text-dot-accent-hover font-medium hover:underline ml-1"
                  >
                    View on Explorer
                  </a>
                </div>
              </Transition>
            </template>

            <template v-else-if="transaction && status === 'success'">
              <div class="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
                <svg
                  viewBox="0 0 96 96"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-16 h-16"
                >
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    stroke="currentColor"
                    stroke-width="4"
                    class="text-success animate-draw-circle"
                    fill="none"
                  />
                  <path
                    d="M30 50l12 12 24-28"
                    stroke="currentColor"
                    stroke-width="5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-success animate-draw-check"
                    fill="none"
                  />
                </svg>
              </div>

              <h2 class="text-xl font-bold text-dot-text-primary mb-2">Congratulations!</h2>
              <p class="text-dot-text-secondary text-sm mb-4">Transaction successful!</p>

              <div class="flex flex-col gap-3">
                <Button size="md" variant="primary" full-width @click="emit('close')">
                  Done
                </Button>

                <Button v-if="explorerUrl" size="md" variant="secondary" full-width as-child>
                  <a :href="explorerUrl" target="_blank" rel="noopener noreferrer">
                    View Details
                  </a>
                </Button>
              </div>
            </template>

            <template v-else-if="transaction && status === 'failed'">
              <div
                class="w-16 h-16 mx-auto mb-6 flex items-center justify-center bg-error/10 rounded-full"
              >
                <Icon name="X" size="xl" class="text-error" />
              </div>

              <h2 class="text-xl font-bold text-dot-text-primary mb-2">
                Transaction Failed or Timed Out
              </h2>
              <p class="text-dot-text-secondary text-sm mb-4">
                Something went wrong during the transaction.<br />
                Please try again or check the block explorer.
              </p>

              <div class="flex flex-col gap-3">
                <Button size="md" variant="primary" full-width @click="emit('close')">
                  Close
                </Button>

                <Button v-if="explorerUrl" size="md" variant="secondary" full-width as-child>
                  <a :href="explorerUrl" target="_blank" rel="noopener noreferrer">
                    View Details
                  </a>
                </Button>
              </div>
            </template>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { zeroHash } from "viem";
import type { TransactionResult, TransactionState } from "../type";
import { BLOCK_EXPLORER } from "../utils";
import { ref, watch, computed, onUnmounted } from "vue";
import { useNetworkStore } from "@/store/useNetworkStore";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";
import GradientLoader from "@/components/ui/GradientLoader.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    handle: string;
    transaction?: TransactionResult | null;
  }>(),
  {
    transaction: null,
  },
);

const networkStore = useNetworkStore();
const emit = defineEmits<{ close: [] }>();

const status = ref<TransactionState>("pending");
const isPending = computed(() => status.value === "pending");

function handleClose() {
  if (!isPending.value) {
    emit("close");
  }
}

function handleEscape(e: KeyboardEvent) {
  if (e.key === "Escape" && !isPending.value) {
    handleClose();
  }
}
const elapsed = ref(0);
let timer: number | null | NodeJS.Timeout = null;

const explorer = networkStore.currentNetwork?.blockExplorerUrls?.[0] || BLOCK_EXPLORER;

const explorerUrl = computed(() =>
  props.transaction?.hash && props.transaction?.hash !== zeroHash
    ? `${explorer}/extrinsic/${props.transaction.hash}`
    : "",
);

function startElapsedTimer() {
  if (timer) clearInterval(timer);
  elapsed.value = 0;
  timer = setInterval(() => elapsed.value++, 1000);
}

watch(
  () => props.transaction,
  (newVal) => {
    if (!newVal) {
      status.value = "pending";
      return;
    }
    if (newVal.status === undefined || newVal.status === null) {
      status.value = "pending";
      startElapsedTimer();
    } else if (newVal.status === true) {
      status.value = "success";
      clearInterval(timer!);
    } else if (newVal.status === false) {
      status.value = "failed";
      clearInterval(timer!);
    }
  },
  { deep: true, immediate: true },
);

watch(
  () => props.open,
  (val) => {
    if (val) {
      startElapsedTimer();
      document.addEventListener("keydown", handleEscape);
    } else {
      if (timer) clearInterval(timer);
      document.removeEventListener("keydown", handleEscape);
    }
  },
);

onUnmounted(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener("keydown", handleEscape);
});
</script>
