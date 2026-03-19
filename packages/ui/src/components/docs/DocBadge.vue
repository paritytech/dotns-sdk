<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
    :class="variantClasses"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Props {
  variant?: "read-only" | "transaction" | "no-wallet" | "default";
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case "read-only":
      return "bg-success/10 text-success border border-success/20";
    case "transaction":
      return "bg-warning/10 text-warning border border-warning/20";
    case "no-wallet":
      return "bg-dot-accent-soft text-dot-accent border border-dot-accent/20";
    default:
      return "bg-dot-surface-secondary text-dot-text-secondary border border-dot-border";
  }
});
</script>
