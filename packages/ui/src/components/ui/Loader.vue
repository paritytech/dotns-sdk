<template>
  <Icon name="Spinner" :size="size" :class="computedClass" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cn } from "@/lib/utils";
import Icon from "./Icon.vue";

interface LoaderProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  class?: string;
}

const props = withDefaults(defineProps<LoaderProps>(), {
  size: "md",
});

const computedClass = computed(() => cn("animate-spin", props.class));
</script>
