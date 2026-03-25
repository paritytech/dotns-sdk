<template>
  <header class="border-b border-dot-border bg-dot-bg/95 backdrop-blur-sm">
    <div
      class="w-full flex items-center justify-between h-16 px-6 sm:px-8 lg:px-10 font-sans text-dot-text-primary"
    >
      <RouterLink to="/" class="inline-flex items-center">
        <Logo />
      </RouterLink>

      <div class="hidden md:block">
        <Navigation />
      </div>

      <div class="flex items-center gap-4">
        <WalletButton />

        <button
          @click="$emit('toggle-menu')"
          class="md:hidden p-2 rounded-lg text-dot-text-secondary hover:bg-dot-surface-secondary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dot-accent/20 focus-visible:ring-offset-2 focus-visible:ring-offset-dot-bg"
          aria-label="Toggle menu"
        >
          <Icon name="Menu" size="lg" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import Logo from "./Logo.vue";
import Navigation from "./Navigation.vue";
import WalletButton from "../WalletButton.vue";
import Icon from "@/components/ui/Icon.vue";
import { RouterLink } from "vue-router";

defineEmits<{ "toggle-menu": [] }>();
</script>
