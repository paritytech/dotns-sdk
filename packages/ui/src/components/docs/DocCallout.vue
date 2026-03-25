<template>
  <div class="rounded-lg border p-4 my-6" :class="variantClasses">
    <div class="flex items-start gap-3">
      <span class="mt-0.5 shrink-0" :class="iconColor">
        <svg
          v-if="variant === 'info' || variant === 'tip'"
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <svg
          v-else-if="variant === 'warning'"
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <svg
          v-else
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6" />
          <path d="M9 9l6 6" />
        </svg>
      </span>
      <div class="flex-1 text-sm leading-relaxed min-w-0">
        <p v-if="title" class="font-semibold mb-1" :class="titleColor">{{ title }}</p>
        <div class="text-dot-text-secondary break-words">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Props {
  variant?: "info" | "tip" | "warning" | "danger";
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "info",
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case "tip":
      return "border-success/30 bg-success/5";
    case "warning":
      return "border-warning/30 bg-warning/5";
    case "danger":
      return "border-error/30 bg-error/5";
    default:
      return "border-dot-accent/30 bg-dot-accent-soft";
  }
});

const iconColor = computed(() => {
  switch (props.variant) {
    case "tip":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-error";
    default:
      return "text-dot-accent";
  }
});

const titleColor = computed(() => {
  switch (props.variant) {
    case "tip":
      return "text-success";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-error";
    default:
      return "text-dot-accent";
  }
});
</script>
