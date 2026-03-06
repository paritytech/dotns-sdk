<template>
  <div
    v-if="transactionStatus !== 'idle'"
    class="fixed top-0 left-0 w-full py-1.5 bg-dot-surface/90 backdrop-blur-md z-[999999] flex flex-col items-center"
  >
    <div class="flex items-center justify-between w-[min(90%,900px)]">
      <div v-for="(step, index) in steps" :key="step.key" class="flex items-center">
        <div
          class="w-2.5 h-2.5 rounded-full transition-all [transition-duration:250ms]"
          :class="{
            'bg-dot-accent animate-pulse-dot': transactionStatus === step.key,
            'bg-success': isCompleted(step.key),
            'bg-dot-border': transactionStatus !== step.key && !isCompleted(step.key),
          }"
        ></div>

        <div
          v-if="index < steps.length - 1"
          class="relative h-[3px] mx-1.5 overflow-hidden rounded-sm"
          :class="{
            'bg-success w-[min(26vw,140px)]': isCompleted(step.key),
            'bg-dot-border w-[min(26vw,140px)]': !isCompleted(step.key),
          }"
        >
          <div
            v-if="transactionStatus === step.key"
            class="absolute top-0 w-1/2 h-full bg-dot-accent animate-move-highlight"
            style="left: -50%"
          ></div>
        </div>
      </div>
    </div>

    <div class="mt-[3px] w-[min(90%,900px)] flex justify-between text-xs opacity-90">
      <span
        v-for="step in steps"
        :key="step.key"
        :class="{
          'font-semibold text-dot-text-primary': transactionStatus === step.key,
          'text-success': isCompleted(step.key),
          'text-dot-text-secondary': transactionStatus !== step.key && !isCompleted(step.key),
        }"
      >
        {{ step.label }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from "pinia";
import { useWalletStore } from "../store/useWalletStore";

const walletStore = useWalletStore();
const { transactionStatus } = storeToRefs(walletStore);

const steps = [
  { key: "signing", label: "Signing" },
  { key: "broadcasting", label: "Broadcast" },
  { key: "included", label: "Included" },
  { key: "finalized", label: "Finalized" },
];

function isCompleted(stepKey) {
  const order = ["signing", "broadcasting", "included", "finalized"];
  return order.indexOf(transactionStatus.value) > order.indexOf(stepKey);
}
</script>
