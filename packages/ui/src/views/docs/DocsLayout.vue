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
        <div data-docs-content class="docs-content overflow-x-hidden">
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
.docs-content :deep(:where(code)) {
  word-break: break-word;
}

.docs-content :deep(:where(h1)) {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-dot-text-primary);
  margin-bottom: 1rem;
}

.docs-content :deep(:where(h2)) {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-dot-text-primary);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  scroll-margin-top: 5rem;
}

.docs-content :deep(:where(h3)) {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-dot-text-primary);
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.docs-content :deep(:where(p)) {
  font-size: 0.875rem;
  line-height: 1.75;
}

.docs-content :deep(:where(code):not(pre code)) {
  font-family: var(--font-mono);
  font-size: 0.875em;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background-color: var(--color-dot-surface-secondary);
  color: var(--color-dot-accent);
  border: 1px solid var(--color-dot-border);
}

.docs-content :deep(:where(pre)) {
  font-size: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-dot-border);
  background-color: var(--color-dot-surface);
  overflow-x: auto;
}

.docs-content :deep(:where(a):not([class])) {
  color: var(--color-dot-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.docs-content :deep(:where(a):not([class]):hover) {
  color: var(--color-dot-accent-hover);
}

.docs-content :deep(:where(.callout, .alert, [role="alert"])) {
  padding: 0.75rem;
  font-size: 0.875rem;
}

.docs-content :deep(:where(li)) {
  font-size: 0.875rem;
}
</style>
