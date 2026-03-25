<template>
  <div
    v-if="steps.length > 0"
    class="rounded-lg border border-dot-border bg-dot-surface p-4 space-y-4"
  >
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-dot-text-primary">
          {{ completedCount >= steps.length ? "All approvals completed" : "Approval plan" }}
        </p>
        <p class="text-xs text-dot-text-tertiary mt-1">
          {{ completedCount }} of {{ steps.length }} wallet
          {{ steps.length === 1 ? "approval" : "approvals" }}
        </p>
      </div>
      <p class="text-xs font-medium text-dot-text-primary tabular-nums">
        {{ Math.round((completedCount / steps.length) * 100) }}%
      </p>
    </div>

    <div class="w-full bg-dot-surface-secondary rounded-full h-1.5 overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="completedCount >= steps.length ? 'bg-success' : 'bg-dot-accent'"
        :style="{ width: `${(completedCount / steps.length) * 100}%` }"
      />
    </div>

    <div class="flex flex-wrap gap-1.5">
      <div
        v-for="step in steps"
        :key="step.key"
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors duration-200 ease-out min-h-[28px]"
        :class="pillClass(step.status)"
        :title="step.label"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="dotClass(step.status)" />
        <span class="truncate max-w-28">{{ step.shortLabel }}</span>
      </div>
    </div>

    <p v-if="activeStep" class="text-xs text-dot-text-secondary border-t border-dot-border pt-3">
      <span class="text-dot-text-primary font-medium">Next:</span> {{ activeStep.label }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

type StepStatus = "done" | "active" | "pending";

type ApprovalStepView = {
  key: string;
  label: string;
  shortLabel: string;
  status: StepStatus;
};

const props = defineProps<{
  steps: ApprovalStepView[];
  activeIndex: number;
  completedCount: number;
}>();

const activeStep = computed(() => {
  if (props.activeIndex >= 0 && props.activeIndex < props.steps.length) {
    return props.steps[props.activeIndex];
  }
  return null;
});

function pillClass(status: StepStatus): string {
  if (status === "done") return "border-success/30 bg-success/5 text-dot-text-primary";
  if (status === "active") return "border-dot-accent/40 bg-dot-accent/10 text-dot-text-primary";
  return "border-dot-border text-dot-text-tertiary";
}

function dotClass(status: StepStatus): string {
  if (status === "done") return "bg-success";
  if (status === "active") return "bg-dot-accent animate-pulse-dot";
  return "bg-dot-border-strong";
}
</script>
