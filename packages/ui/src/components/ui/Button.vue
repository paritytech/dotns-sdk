<template>
  <button :type="type" :disabled="disabled || loading" :class="computedClass" v-bind="$attrs">
    <Icon v-if="loading" name="Spinner" :size="iconSize" class="animate-spin" />
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import Icon from "./Icon.vue";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "border-2 border-dot-surface-secondary bg-dot-surface-secondary text-dot-text-primary hover:bg-dot-bg focus-visible:ring-dot-accent/20",
        secondary:
          "border-2 border-dot-border bg-transparent text-dot-text-primary hover:border-dot-border-strong hover:bg-dot-surface-secondary focus-visible:ring-dot-accent/20",
        wallet:
          "bg-dot-surface text-dot-text-primary hover:bg-dot-surface-secondary focus-visible:ring-dot-accent/20",
        "wallet-connected":
          "bg-dot-surface-secondary text-dot-text-primary hover:bg-dot-surface-primary focus-visible:ring-dot-accent/20",
        outline:
          "border border-dot-border bg-transparent text-dot-text-secondary hover:bg-dot-surface-secondary focus-visible:ring-dot-accent/20",
        ghost:
          "text-dot-text-secondary hover:bg-dot-surface-secondary focus-visible:ring-dot-accent/20",
        destructive: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400",
        link: "text-dot-accent underline-offset-4 hover:underline hover:text-dot-accent-hover",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-10 px-4 text-sm rounded-lg",
        lg: "h-12 px-6 text-base rounded-xl",
        icon: "h-10 w-10 rounded-lg",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      fullWidth: false,
    },
  },
);

interface Props {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "destructive"
    | "link"
    | "wallet"
    | "wallet-connected";
  size?: "sm" | "md" | "lg" | "icon";
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  type: "button",
  disabled: false,
  loading: false,
  variant: "primary",
  size: "md",
  fullWidth: false,
});

const computedClass = computed(() =>
  cn(
    buttonVariants({
      variant: props.variant,
      size: props.size,
      fullWidth: props.fullWidth,
    }),
    props.class,
  ),
);

const iconSize = computed(() => {
  switch (props.size) {
    case "sm":
      return "xs";
    case "lg":
      return "md";
    default:
      return "sm";
  }
});
</script>
