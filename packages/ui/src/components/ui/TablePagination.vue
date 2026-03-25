<template>
  <div
    v-if="totalItems > 0"
    class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 py-2 border-t border-dot-border bg-dot-surface-secondary"
  >
    <div class="flex items-center gap-3 text-xs text-dot-text-tertiary">
      <span>
        {{ rangeStart }}&ndash;{{ rangeEnd }} of {{ totalItems }} {{ itemLabel
        }}{{ totalItems === 1 ? "" : "s" }}
      </span>
      <div v-if="pageSizeOptions.length > 1" class="flex items-center gap-1.5">
        <span class="hidden sm:inline text-dot-text-tertiary">Show</span>
        <select
          :value="pageSize"
          class="appearance-none border border-dot-border bg-dot-surface text-dot-text-primary rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-dot-accent/30 cursor-pointer transition-colors hover:border-dot-border-strong"
          @change="onPageSizeChange"
        >
          <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
        </select>
        <span class="hidden sm:inline text-dot-text-tertiary">per page</span>
      </div>
    </div>
    <div v-if="totalPages > 1" class="flex items-center gap-1">
      <button
        :disabled="modelValue <= 1"
        class="inline-flex items-center justify-center h-7 w-7 rounded-md text-dot-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-dot-surface hover:text-dot-text-primary"
        aria-label="Previous page"
        @click="prev"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <template v-for="page in visiblePages" :key="page">
        <span v-if="page === '...'" class="px-1 text-xs text-dot-text-tertiary select-none">
          ...
        </span>
        <button
          v-else
          class="inline-flex items-center justify-center h-7 min-w-[1.75rem] px-1 rounded-md text-xs font-medium transition-colors"
          :class="
            page === modelValue
              ? 'bg-dot-accent/10 text-dot-text-primary'
              : 'text-dot-text-secondary hover:bg-dot-surface hover:text-dot-text-primary'
          "
          @click="emit('update:modelValue', page as number)"
        >
          {{ page }}
        </button>
      </template>
      <button
        :disabled="modelValue >= totalPages"
        class="inline-flex items-center justify-center h-7 w-7 rounded-md text-dot-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-dot-surface hover:text-dot-text-primary"
        aria-label="Next page"
        @click="next"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

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

const rangeStart = computed(() => (props.modelValue - 1) * props.pageSize + 1);
const rangeEnd = computed(() => Math.min(props.modelValue * props.pageSize, props.totalItems));

const visiblePages = computed((): (number | "...")[] => {
  const total = totalPages.value;
  const current = props.modelValue;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");

  pages.push(total);
  return pages;
});

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
