<template>
  <div :class="computedClass">
    <svg class="w-full h-full" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="loader-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" :stop-color="COLORS.PRIMARY_GRADIENT_START" />
          <stop offset="100%" :stop-color="COLORS.PRIMARY_GRADIENT_END" />
        </linearGradient>
      </defs>
      <circle
        class="text-dot-border"
        stroke="currentColor"
        stroke-width="10"
        fill="none"
        cx="50"
        cy="50"
        r="40"
      />
      <circle
        class="animate-loader-combined"
        stroke="url(#loader-gradient)"
        stroke-width="10"
        stroke-linecap="round"
        fill="none"
        cx="50"
        cy="50"
        r="40"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { COLORS } from "@/lib/constants";

interface Props {
  size?: "sm" | "md" | "lg";
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: "md",
});

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-20 h-20",
  lg: "w-32 h-32",
};

const computedClass = computed(() => {
  const classes = ["relative", sizeClasses[props.size]];
  if (props.class) {
    classes.push(props.class);
  }
  return classes.join(" ");
});
</script>
