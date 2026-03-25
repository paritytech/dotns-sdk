<template>
  <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 font-sans text-center">
    <div class="mb-6 animate-fade-in">
      <h1 class="text-xl sm:text-2xl font-serif font-extrabold text-dot-text-primary mb-2">
        Find Your <span class="text-dot-accent">.dot</span> Handle
      </h1>
      <p class="text-sm text-dot-text-secondary max-w-2xl mx-auto">
        Search for available handles or verify existing registrations on Polkadot.
      </p>
    </div>

    <SearchInput />
  </main>
</template>

<script setup lang="ts">
import SearchInput from "../components/domain/SearchInput.vue";
</script>
