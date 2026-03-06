<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-300"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        @click.self="$emit('close')"
      >
        <Transition
          enter-active-class="transform transition duration-300 ease-out"
          enter-from-class="scale-95 opacity-0 translate-y-4"
          enter-to-class="scale-100 opacity-100 translate-y-0"
          leave-active-class="transform transition duration-200 ease-in"
          leave-from-class="scale-100 opacity-100 translate-y-0"
          leave-to-class="scale-95 opacity-0 translate-y-4"
        >
          <div
            v-if="open"
            class="bg-dot-surface rounded-2xl shadow-2xl w-full max-w-md p-10 text-center relative"
          >
            <button
              class="absolute top-5 right-5 text-dot-text-tertiary hover:text-dot-text-secondary transition-colors"
              @click="$emit('close')"
              aria-label="Close transaction status"
            >
              <Icon name="X" size="md" />
            </button>

            <template v-if="transaction && status === 'pending'">
              <GradientLoader size="md" class="mx-auto mb-8" />

              <h2 class="text-2xl font-semibold text-dot-text-primary mb-2">
                Submitting Transaction
              </h2>
              <p class="text-dot-text-tertiary text-sm mb-4">
                Your transaction is being finalized. Please wait...
              </p>

              <div v-if="elapsed > 15" class="text-sm text-dot-text-secondary">
                It looks like this is taking longer than usual. Please be patient
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
            </template>

            <template v-else-if="transaction && status === 'success'">
              <div
                class="w-20 h-20 mx-auto mb-8 flex items-center justify-center bg-success/10 rounded-full"
              >
                <span class="text-4xl text-success">&#10003;</span>
              </div>

              <h2 class="text-2xl font-extrabold text-dot-text-primary mb-2">Congratulations!</h2>
              <p class="text-dot-text-secondary text-sm mb-6">Transaction successful!</p>

              <div class="flex flex-col space-y-3">
                <Button size="lg" variant="primary" full-width @click="$emit('close')">
                  Done
                </Button>

                <Button v-if="explorerUrl" size="lg" variant="secondary" full-width as-child>
                  <a :href="explorerUrl" target="_blank" rel="noopener noreferrer">
                    View Details
                  </a>
                </Button>
              </div>
            </template>

            <template v-else-if="transaction && status === 'failed'">
              <div
                class="w-20 h-20 mx-auto mb-8 flex items-center justify-center bg-error/10 rounded-full"
              >
                <span class="text-4xl text-error">&#10007;</span>
              </div>

              <h2 class="text-2xl font-bold text-dot-text-primary mb-2">
                Transaction Failed or Timed Out
              </h2>
              <p class="text-dot-text-secondary text-sm mb-6">
                Something went wrong during the transaction.<br />
                Please try again or check the block explorer.
              </p>

              <div class="flex flex-col space-y-3">
                <Button size="lg" variant="primary" full-width @click="$emit('close')">
                  Close
                </Button>

                <Button v-if="explorerUrl" size="lg" variant="secondary" full-width as-child>
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
defineEmits<{ close: [] }>();

const status = ref<TransactionState>("pending");
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
      console.log("watch:props.transaction ", newVal);
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
    if (val) startElapsedTimer();
    else if (timer) clearInterval(timer);
  },
);

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
