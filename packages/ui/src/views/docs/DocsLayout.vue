<template>
  <div class="flex min-h-[calc(100vh-64px)]">
    <DocsSidebar class="hidden md:block sticky top-16 h-[calc(100vh-64px)]" />

    <button
      @click="mobileOpen = true"
      class="fixed bottom-6 right-6 z-30 md:hidden p-3 rounded-full bg-dot-surface-secondary border border-dot-border text-dot-text-secondary shadow-lg active:scale-95 transition-transform hover:text-dot-text-primary"
      aria-label="Open docs menu"
    >
      <Icon name="Menu" size="lg" />
    </button>

    <DocsMobileSidebar :is-open="mobileOpen" @close="mobileOpen = false" />

    <div class="flex-1 min-w-0">
      <div class="max-w-3xl mx-auto px-6 py-10 pb-24">
        <div data-docs-content class="px-4 overflow-x-hidden">
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
