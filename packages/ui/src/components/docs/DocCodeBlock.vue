<template>
  <div class="my-4 group relative">
    <div
      v-if="filename"
      class="flex items-center px-4 py-2 bg-dot-surface border border-dot-border border-b-0 rounded-t-lg overflow-hidden"
    >
      <span class="text-xs text-dot-text-tertiary font-mono truncate">{{ filename }}</span>
    </div>
    <div
      class="relative overflow-x-auto border border-dot-border bg-dot-surface text-sm font-mono"
      :class="filename ? 'rounded-b-lg' : 'rounded-lg'"
    >
      <button
        @click="copyCode"
        class="absolute right-2 top-2 p-1.5 rounded-md bg-dot-surface-secondary text-dot-text-tertiary hover:text-dot-text-primary opacity-0 group-hover:opacity-100 transition-all duration-150 z-10"
        :title="copied ? 'Copied!' : 'Copy code'"
      >
        <svg
          v-if="!copied"
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 2.57A2 2 0 0014.685 2H10a2 2 0 00-2 2z"
          />
          <path d="M16 18v2a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2" />
        </svg>
        <svg
          v-else
          class="w-4 h-4 text-success"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </button>
      <div
        v-if="highlighted"
        v-html="highlighted"
        class="p-4 [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!text-sm"
      />
      <pre
        v-else
        class="p-4 text-dot-text-secondary whitespace-pre-wrap"
      ><code>{{ code }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";

interface Props {
  code: string;
  lang?: string;
  filename?: string;
}

const props = withDefaults(defineProps<Props>(), {
  lang: "typescript",
});

const highlighted = ref<string>("");
const copied = ref(false);

async function highlight() {
  try {
    const { codeToHtml } = await import("shiki");
    highlighted.value = await codeToHtml(props.code, {
      lang: props.lang,
      theme: "vitesse-dark",
    });
  } catch {
    highlighted.value = "";
  }
}

onMounted(highlight);
watch(() => props.code, highlight);

function copyCode() {
  navigator.clipboard.writeText(props.code);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>
