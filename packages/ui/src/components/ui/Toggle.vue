<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="computedClass"
    @click="toggle"
  >
    <span :class="thumbClass" />
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  modelValue: boolean;
  disabled?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

function toggle() {
  if (!props.disabled) {
    emit("update:modelValue", !props.modelValue);
  }
}

const computedClass = computed(() =>
  cn(
    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/20 focus-visible:ring-offset-2 focus-visible:ring-offset-dot-bg disabled:cursor-not-allowed disabled:opacity-50",
    props.modelValue ? "bg-dot-accent" : "bg-dot-border-strong",
    props.class,
  ),
);

const thumbClass = computed(() =>
  cn(
    "pointer-events-none block h-4 w-4 rounded-full bg-dot-bg shadow-sm transition-transform duration-200",
    props.modelValue ? "translate-x-5" : "translate-x-1",
  ),
);
</script>
