<template>
  <component :is="iconComponent" :class="computedClass" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import { Icons, type IconName } from "./icons";

interface IconProps {
  name: IconName;
  class?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const props = withDefaults(defineProps<IconProps>(), {
  size: "md",
});

const iconComponent = computed<Component>(() => Icons[props.name]);

const sizeClasses: Record<NonNullable<IconProps["size"]>, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

const computedClass = computed(() => {
  const classes = [sizeClasses[props.size]];
  if (props.class) {
    classes.push(props.class);
  }
  return classes.join(" ");
});
</script>
