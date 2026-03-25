<template>
  <div class="my-4">
    <div class="flex items-start gap-4 p-5 border border-dot-border rounded-lg bg-dot-surface">
      <span
        class="mt-0.5 w-7 h-7 rounded-full bg-dot-accent-soft text-dot-accent flex items-center justify-center text-xs font-bold shrink-0"
        >{{ step }}</span
      >
      <div class="min-w-0 flex-1">
        <p v-if="title" class="text-sm font-medium text-dot-text-primary">{{ title }}</p>
        <p v-if="description" class="text-xs text-dot-text-secondary mt-1">{{ description }}</p>
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  step: number | string;
  title?: string;
  description?: string;
}>();
</script>
