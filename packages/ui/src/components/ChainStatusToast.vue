<template>
  <div class="flex items-center gap-3">
    <span class="text-sm">{{ message }}</span>
    <Button variant="primary" size="sm" class="shrink-0" @click="reload">Refresh</Button>
  </div>
</template>

<script setup lang="ts">
import Button from "@/components/ui/Button.vue";

defineProps<{ message: string }>();

function reload(): void {
  window.location.reload();
}
</script>
