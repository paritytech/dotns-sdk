<template>
  <div class="my-6 p-6 border border-dot-border rounded-xl bg-dot-surface overflow-x-auto">
    <div v-if="title" class="text-sm font-medium text-dot-text-tertiary mb-4">{{ title }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>
