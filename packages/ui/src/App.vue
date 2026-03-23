<template>
  <div class="min-h-screen bg-dot-bg">
    <AppHeader @toggle-menu="toggleMobileMenu" />
    <TopProgress />
    <TransactionTimeline />

    <main class="transition-all duration-300 pb-12">
      <RouterView />
    </main>

    <AppFooter />
    <MobileMenu :is-open="isMobileMenuOpen" @close="toggleMobileMenu" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeMount, ref } from "vue";
import { RouterView } from "vue-router";
import AppHeader from "./components/layout/AppHeader.vue";
import AppFooter from "./components/layout/AppFooter.vue";
import MobileMenu from "./components/layout/MobileMenu.vue";
import { AppInitializer } from "./services/AppInitializer";
import TopProgress from "./components/LoadingBar.vue";
import TransactionTimeline from "./components/TransactionTimeline.vue";

const isMobileMenuOpen = ref(false);
const toggleMobileMenu = () => (isMobileMenuOpen.value = !isMobileMenuOpen.value);

onBeforeMount(async () => {
  await AppInitializer.initialize();
});
</script>
