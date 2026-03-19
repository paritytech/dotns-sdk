<template>
  <div class="flex min-h-[calc(100vh-64px)]">
    <DocsSidebar class="hidden md:block sticky top-16 h-[calc(100vh-64px)]" />

    <button
      @click="mobileOpen = true"
      class="fixed bottom-4 right-4 z-30 md:hidden p-3 rounded-full bg-dot-accent text-white shadow-lg active:scale-95 transition-transform"
      aria-label="Open docs menu"
    >
      <Icon name="Menu" size="lg" />
    </button>

    <DocsMobileSidebar :is-open="mobileOpen" @close="mobileOpen = false" />

    <div class="flex-1 min-w-0">
      <div class="max-w-3xl mx-auto px-6 py-10 lg:mx-0 lg:ml-[calc((100%-48rem-12rem)/2)]">
        <div data-docs-content class="overflow-x-hidden">
          <ErrorBoundary>
            <RouterView />
          </ErrorBoundary>
        </div>
      </div>
    </div>

    <DocsTableOfContents class="hidden lg:block sticky top-16 h-[calc(100vh-64px)] py-10 pr-6" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import DocsSidebar from "@/components/docs/DocsSidebar.vue";
import DocsMobileSidebar from "@/components/docs/DocsMobileSidebar.vue";
import DocsTableOfContents from "@/components/docs/DocsTableOfContents.vue";
import Icon from "@/components/ui/Icon.vue";
import ErrorBoundary from "@/components/ui/ErrorBoundary.vue";

const mobileOpen = ref(false);
</script>

<style scoped>
[data-docs-content] :deep(:where(code)) {
  word-break: break-word;
}
</style>
