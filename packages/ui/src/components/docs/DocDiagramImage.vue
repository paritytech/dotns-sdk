<template>
  <div class="my-6 border border-dot-border rounded-xl bg-dot-surface overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 border-b border-dot-border">
      <p class="text-xs font-medium text-dot-text-tertiary">{{ caption }}</p>
      <div class="flex items-center gap-1">
        <button
          class="w-7 h-7 rounded-md bg-dot-surface-secondary text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-border flex items-center justify-center transition-colors"
          title="Zoom out"
          @click="zoomOut"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <span class="text-xs text-dot-text-tertiary w-10 text-center tabular-nums">
          {{ Math.round(scale * 100) }}%
        </span>
        <button
          class="w-7 h-7 rounded-md bg-dot-surface-secondary text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-border flex items-center justify-center transition-colors"
          title="Zoom in"
          @click="zoomIn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button
          class="w-7 h-7 rounded-md bg-dot-surface-secondary text-dot-text-secondary hover:text-dot-text-primary hover:bg-dot-border flex items-center justify-center transition-colors"
          title="Reset zoom"
          @click="resetZoom"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    </div>
    <div
      ref="viewport"
      class="overflow-auto cursor-grab active:cursor-grabbing"
      :style="{ maxHeight: maxHeight + 'px' }"
      @wheel.prevent="onWheel"
      @mousedown="onMouseDown"
    >
      <div
        class="inline-block min-w-full origin-top-left transition-transform duration-150 ease-out bg-white"
        :style="{ transform: `scale(${scale})` }"
      >
        <img :src="src" :alt="alt" class="block max-w-none" :style="{ width: imgWidth }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = withDefaults(
  defineProps<{
    src: string;
    alt: string;
    caption: string;
    maxHeight?: number;
  }>(),
  {
    maxHeight: 600,
  },
);

const scale = ref(1);
const viewport = ref<HTMLDivElement>();

const imgWidth = computed(() => {
  return props.src ? "100%" : "auto";
});

function zoomIn() {
  scale.value = Math.min(scale.value + 0.25, 3);
}

function zoomOut() {
  scale.value = Math.max(scale.value - 0.25, 0.25);
}

function resetZoom() {
  scale.value = 1;
  if (viewport.value) {
    viewport.value.scrollLeft = 0;
    viewport.value.scrollTop = 0;
  }
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  } else {
    if (viewport.value) {
      viewport.value.scrollLeft += e.deltaX;
      viewport.value.scrollTop += e.deltaY;
    }
  }
}

function onMouseDown(e: MouseEvent) {
  if (!viewport.value) return;
  const el = viewport.value;
  const startX = e.clientX;
  const startY = e.clientY;
  const scrollLeft = el.scrollLeft;
  const scrollTop = el.scrollTop;

  function onMouseMove(e: MouseEvent) {
    el.scrollLeft = scrollLeft - (e.clientX - startX);
    el.scrollTop = scrollTop - (e.clientY - startY);
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
</script>
