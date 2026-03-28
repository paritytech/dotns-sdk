<template>
  <div
    v-if="activeStatus !== 'idle'"
    class="fixed top-0 left-0 w-full py-1.5 bg-dot-surface/90 backdrop-blur-md z-[999999] flex flex-col items-center"
  >
    <div class="flex items-center justify-between w-[min(90%,900px)]">
      <div v-for="(step, index) in activeSteps" :key="step.key" class="flex items-center">
        <div
          class="w-2.5 h-2.5 rounded-full transition-all [transition-duration:250ms]"
          :class="{
            'bg-dot-accent animate-pulse-dot': activeStatus === step.key,
            'bg-success': isCompleted(step.key),
            'bg-dot-border': activeStatus !== step.key && !isCompleted(step.key),
          }"
        ></div>

        <div
          v-if="index < activeSteps.length - 1"
          class="relative h-[3px] mx-1.5 overflow-hidden rounded-sm"
          :class="{
            'bg-success': isCompleted(step.key),
            'bg-dot-border': !isCompleted(step.key),
          }"
          :style="{
            width: `min(${Math.floor(80 / activeSteps.length)}vw, ${Math.floor(700 / activeSteps.length)}px)`,
          }"
        >
          <div
            v-if="activeStatus === step.key"
            class="absolute top-0 w-1/2 h-full bg-dot-accent animate-move-highlight"
            style="left: -50%"
          ></div>
        </div>
      </div>
    </div>

    <div class="mt-[3px] w-[min(90%,900px)] flex justify-between text-xs opacity-90">
      <span
        v-for="step in activeSteps"
        :key="step.key"
        :class="{
          'font-semibold text-dot-text-primary': activeStatus === step.key,
          'text-success': isCompleted(step.key),
          'text-dot-text-secondary': activeStatus !== step.key && !isCompleted(step.key),
        }"
      >
        {{ step.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useWalletStore } from "../store/useWalletStore";
import { useBulletinStore } from "../store/useBulletinStore";

const walletStore = useWalletStore();
const bulletinStore = useBulletinStore();
const { transactionStatus } = storeToRefs(walletStore);
const { uploadStage } = storeToRefs(bulletinStore);

const DEFAULT_STEPS = [
  { key: "signing", label: "Signing" },
  { key: "broadcasting", label: "Broadcast" },
  { key: "included", label: "Included" },
  { key: "finalized", label: "Finalized" },
];

const verifyingLabel = computed(() =>
  bulletinStore.statusMessage.startsWith("Verified") ? "Verified" : "Verifying",
);

const BULLETIN_STEPS = computed(() => [
  ...DEFAULT_STEPS,
  { key: "verifying", label: verifyingLabel.value },
  { key: "caching", label: bulletinStore.cachingEnabled ? "Caching" : "Caching (off)" },
]);

const REJECTION_MARKERS = ["cancelled", "rejected", "denied"];

function isUserRejection(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return REJECTION_MARKERS.some((marker) => lower.includes(marker));
}

const isBulletinUpload = computed(() => {
  const stage = uploadStage.value;
  if (stage === "idle") return false;
  if (stage === "done") return true;
  if (stage === "error") return isUserRejection(bulletinStore.statusMessage);
  return true;
});

const activeSteps = computed(() => (isBulletinUpload.value ? BULLETIN_STEPS.value : DEFAULT_STEPS));

const activeStatus = computed(() => {
  if (!isBulletinUpload.value) return transactionStatus.value;

  const stage = uploadStage.value;
  if (stage === "done") return "done";
  if (stage === "error") return lastActiveStep.value;
  if (stage === "verifying") return "verifying";
  if (stage === "caching") return "caching";

  const txStatus = transactionStatus.value;
  return txStatus !== "idle" ? txStatus : "signing";
});

const lastActiveStep = ref("signing");

watch(activeStatus, (newStatus) => {
  if (newStatus !== "idle" && uploadStage.value !== "error") {
    lastActiveStep.value = newStatus;
  }
});

const activeOrder = computed(() => activeSteps.value.map((s) => s.key));

function isCompleted(stepKey: string): boolean {
  if (activeStatus.value === "done") return true;
  const order = activeOrder.value;
  return order.indexOf(activeStatus.value) > order.indexOf(stepKey);
}
</script>
