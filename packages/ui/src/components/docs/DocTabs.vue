<template>
  <div class="my-6">
    <div class="flex gap-1 border-b border-dot-border overflow-x-auto">
      <button
        v-for="(tab, i) in tabs"
        :key="tab"
        @click="activeIndex = i"
        class="px-4 py-2 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px whitespace-nowrap shrink-0"
        :class="
          activeIndex === i
            ? 'text-dot-accent border-dot-accent'
            : 'text-dot-text-tertiary border-transparent hover:text-dot-text-secondary hover:border-dot-border-strong'
        "
      >
        {{ tab }}
      </button>
    </div>
    <div class="mt-3 p-4 min-h-[12rem]">
      <slot :name="`tab-${activeIndex}`" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  tabs: string[];
}>();

const activeIndex = ref(0);
</script>
