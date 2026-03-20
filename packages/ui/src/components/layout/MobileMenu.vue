<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        @click="$emit('close')"
        class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
      />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen"
        class="fixed right-0 top-0 bottom-0 w-64 bg-dot-surface border-l border-dot-border shadow-2xl z-50 md:hidden"
      >
        <div class="flex flex-col h-full font-sans text-dot-text-primary">
          <div class="flex items-center justify-between p-4 border-b border-dot-border">
            <span class="text-xl font-bold text-dot-text-primary">Menu</span>
            <button
              @click="$emit('close')"
              class="p-2 rounded-lg text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors"
              aria-label="Close menu"
            >
              <Icon name="X" size="lg" />
            </button>
          </div>

          <nav class="flex-1 p-4">
            <RouterLink
              v-for="item in navItems"
              :key="item.name"
              :to="item.path"
              class="block w-full text-left px-4 py-3 rounded-lg text-sm font-medium mb-2 transition-all duration-200"
              :class="
                isActive(item.path)
                  ? 'bg-dot-surface-secondary text-dot-text-primary'
                  : 'text-dot-text-secondary hover:bg-dot-surface-secondary hover:text-dot-text-primary'
              "
              @click="$emit('close')"
            >
              {{ item.name }}
            </RouterLink>
          </nav>

          <div class="p-4 border-t border-dot-border text-center text-xs text-dot-text-tertiary">
            © {{ currentYear }} Dotns
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useWalletStore } from "@/store/useWalletStore";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "@/components/ui/Icon.vue";

defineProps<{ isOpen: boolean }>();
defineEmits<{ close: [] }>();

const route = useRoute();
const wallet = useWalletStore();

const navItems = ref(
  wallet.isConnected
    ? [
        { name: "Search", path: "/" },
        { name: "Lookup", path: "/lookup" },
        { name: "Profile", path: "/profile" },
        { name: "Docs", path: "/docs" },
      ]
    : [
        { name: "Search", path: "/" },
        { name: "Lookup", path: "/lookup" },
        { name: "Docs", path: "/docs" },
      ],
);

const isActive = (path: string) => {
  if (path === "/docs") return route.path.startsWith("/docs");
  return route.path === path;
};

const currentYear = new Date().getFullYear();

watch(
  () => wallet.isConnected,
  (isConnected: boolean) => {
    navItems.value = isConnected
      ? [
          { name: "Search", path: "/" },
          { name: "Lookup", path: "/lookup" },
          { name: "Profile", path: "/profile" },
          { name: "Docs", path: "/docs" },
        ]
      : [
          { name: "Search", path: "/" },
          { name: "Lookup", path: "/lookup" },
          { name: "Docs", path: "/docs" },
        ];
  },
);
</script>
