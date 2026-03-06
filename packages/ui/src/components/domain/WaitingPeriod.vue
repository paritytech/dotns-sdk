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
            <h2 class="text-2xl font-bold text-dot-text-primary mb-3 mt-2">
              {{ localHandle }}
            </h2>

            <p class="text-dot-text-tertiary text-sm mb-10 leading-relaxed">
              Let’s make sure no one else is registering this handle during this confirmation
              period.
            </p>

            <div class="relative w-52 h-52 mx-auto mb-10">
              <svg
                class="absolute inset-0 w-full h-full"
                viewBox="0 0 240 240"
                :class="{ 'animate-pulse-ring': remaining === 0 }"
              >
                <circle cx="120" cy="120" r="100" stroke="#44403c" stroke-width="10" fill="none" />

                <circle
                  cx="120"
                  cy="120"
                  r="100"
                  class="stroke-primary"
                  stroke-width="10"
                  fill="none"
                  stroke-linecap="round"
                  :stroke-dasharray="circumference"
                  :stroke-dashoffset="strokeOffset"
                />
              </svg>

              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <div class="text-5xl font-extrabold text-dot-text-primary">
                  {{ remaining }}
                </div>
                <div class="text-sm text-dot-text-tertiary">seconds left</div>
              </div>
            </div>

            <div class="flex justify-center">
              <Button
                variant="primary"
                size="icon"
                class="w-20 rounded-full"
                @click="cancelWaiting"
                :disabled="isFinalizing"
                :loading="isFinalizing"
              >
                <span v-if="!isFinalizing" class="flex space-x-1">
                  <span
                    v-for="i in 3"
                    :key="i"
                    class="w-2 h-2 bg-white rounded-full opacity-70 animate-bounce-dot"
                    :style="{ animationDelay: `${(i - 1) * 0.25}s` }"
                  ></span>
                </span>
              </Button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onUnmounted, computed, watch } from "vue";
import { zeroHash } from "viem";
import type { TransactionResult } from "@/type";
import Button from "@/components/ui/Button.vue";

const props = defineProps<{
  open: boolean;
  handle: string;
  duration: number;
  onComplete: () => Promise<any>;
}>();

const emit = defineEmits<{
  close: [];
  finalized: [TransactionResult];
}>();

const localHandle = ref("");
const remaining = ref(props.duration);
const isFinalizing = ref(false);

const radius = 100;
const circumference = 2 * Math.PI * radius;

const strokeOffset = computed(() => {
  const progress = remaining.value / props.duration;
  return circumference * progress;
});

let timer: number | null = null;

function startCountdown() {
  if (timer) clearInterval(timer);
  remaining.value = props.duration;
  timer = window.setInterval(async () => {
    if (remaining.value > 0) {
      remaining.value--;
    } else {
      clearInterval(timer!);
      await autoFinalize();
    }
  }, 1000);
}

async function autoFinalize() {
  try {
    isFinalizing.value = true;
    const res = await props.onComplete();
    emit("finalized", res);
  } catch {
    emit("finalized", { status: false, hash: zeroHash });
  } finally {
    isFinalizing.value = false;
    emit("close");
  }
}

function cancelWaiting() {
  clearInterval(timer!);
  emit("close");
}

watch(
  () => props.open,
  (v) => {
    if (v) startCountdown();
    else if (timer) clearInterval(timer);
  },
);

import { useDomainValidation } from "@/composables/useDomainValidation";

const handleRef = computed(() => props.handle);
const { withDot } = useDomainValidation(handleRef);

watch(
  withDot,
  (v) => {
    localHandle.value = v;
  },
  { immediate: true },
);

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
