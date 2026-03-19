<template>
  <component :is="tag" :id="anchor" class="group scroll-mt-20" :class="headingClasses">
    <a :href="`#${anchor}`" class="flex items-center gap-2 min-w-0">
      <span class="break-words min-w-0"><slot /></span>
      <span
        class="opacity-0 group-hover:opacity-100 text-dot-text-tertiary transition-opacity duration-150"
        >#</span
      >
    </a>
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Props {
  level: 1 | 2 | 3;
  anchor: string;
}

const props = defineProps<Props>();

const tag = computed(() => `h${props.level}`);

const headingClasses = computed(() => {
  switch (props.level) {
    case 1:
      return "text-4xl font-serif text-dot-text-primary mb-4";
    case 2:
      return "text-2xl font-semibold text-dot-text-primary mt-10 mb-4";
    case 3:
      return "text-lg font-semibold text-dot-text-primary mt-8 mb-3";
    default:
      return "";
  }
});
</script>
