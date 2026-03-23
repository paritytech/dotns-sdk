<template>
  <aside v-if="headings.length > 1" class="w-48 shrink-0">
    <div class="sticky top-20">
      <p class="text-xs font-semibold uppercase tracking-wider text-dot-text-tertiary mb-3">
        On this page
      </p>
      <nav class="space-y-1">
        <a
          v-for="heading in headings"
          :key="heading.id"
          :href="`#${heading.id}`"
          @click.prevent="scrollTo(heading.id)"
          class="block text-xs py-1 transition-colors duration-150 border-l-2 pl-3 truncate"
          :title="heading.text"
          :class="
            activeId === heading.id
              ? 'border-dot-accent text-dot-accent'
              : 'border-transparent text-dot-text-tertiary hover:text-dot-text-secondary'
          "
        >
          {{ heading.text }}
        </a>
      </nav>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRoute } from "vue-router";

interface Heading {
  id: string;
  text: string;
}

const route = useRoute();
const headings = ref<Heading[]>([]);
const activeId = ref("");

let observer: IntersectionObserver | null = null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function scanHeadings() {
  if (observer) {
    observer.disconnect();
  }

  const container = document.querySelector("[data-docs-content]");
  if (!container) return;

  const h2Elements = container.querySelectorAll("h2");
  const found: Heading[] = [];

  h2Elements.forEach((el) => {
    const text = el.textContent?.trim() ?? "";
    if (!text) return;

    const id = el.id || slugify(text);
    if (!el.id) {
      el.id = id;
      el.classList.add("scroll-mt-20");
    }
    found.push({ id, text });
  });

  headings.value = found;
  activeId.value = found[0]?.id ?? "";

  if (found.length < 2) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId.value = entry.target.id;
        }
      }
    },
    {
      rootMargin: "-80px 0px -70% 0px",
      threshold: 0,
    },
  );

  h2Elements.forEach((el) => {
    if (el.id) observer!.observe(el);
  });
}

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    activeId.value = id;
  }
}

watch(
  () => route.path,
  async () => {
    await nextTick();
    // Small delay to allow page components to render
    setTimeout(scanHeadings, 100);
  },
);

onMounted(() => {
  setTimeout(scanHeadings, 100);
});

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect();
  }
});
</script>
