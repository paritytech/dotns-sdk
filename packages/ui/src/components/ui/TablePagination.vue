<template>
  <div
    v-if="totalItems > 0"
    class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-dot-border bg-dot-surface-secondary"
  >
    <div class="flex items-center gap-3 text-xs text-dot-text-tertiary">
      <span>{{ totalItems }} {{ itemLabel }}{{ totalItems === 1 ? "" : "s" }}</span>
      <div v-if="pageSizeOptions.length > 1" class="flex items-center gap-1.5">
        <span class="hidden sm:inline">Show</span>
        <select
          :value="pageSize"
          class="border border-dot-border bg-dot-surface text-dot-text-primary rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-dot-accent/30"
          @change="onPageSizeChange"
        >
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
        <span class="hidden sm:inline">per page</span>
      </div>
    </div>
    <div v-if="totalPages > 1" class="flex items-center gap-2">
      <Button size="sm" variant="secondary" :disabled="modelValue <= 1" @click="prev">
        Previous
      </Button>
      <span class="text-xs text-dot-text-secondary"> {{ modelValue }} / {{ totalPages }} </span>
      <Button size="sm" variant="secondary" :disabled="modelValue >= totalPages" @click="next">
        Next
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/Button.vue";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    totalItems: number;
    pageSize: number;
    itemLabel?: string;
    pageSizeOptions?: number[];
  }>(),
  {
    itemLabel: "item",
    pageSizeOptions: () => [10, 25, 50],
  },
);

const emit = defineEmits<{
  "update:modelValue": [page: number];
  "update:pageSize": [size: number];
}>();

const totalPages = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));

function onPageSizeChange(event: Event) {
  const newSize = Number((event.target as HTMLSelectElement).value);
  emit("update:pageSize", newSize);
  emit("update:modelValue", 1);
}

function prev() {
  if (props.modelValue > 1) emit("update:modelValue", props.modelValue - 1);
}

function next() {
  if (props.modelValue < totalPages.value) emit("update:modelValue", props.modelValue + 1);
}
</script>
