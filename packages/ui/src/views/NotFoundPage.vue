<template>
  <div class="flex flex-col items-center justify-center min-h-[80vh] text-center px-6">
    <p class="text-7xl font-bold text-dot-accent mb-4">404</p>

    <h1 class="text-2xl font-semibold text-dot-text-primary mb-2">Page Not Found</h1>

    <p class="text-dot-text-secondary text-sm max-w-md mb-8">
      The page you're looking for doesn't exist or has been moved.
    </p>

    <div class="flex gap-3">
      <Button variant="primary" @click="router.push('/')">Go Home</Button>
      <Button variant="secondary" @click="router.push('/docs/introduction')">View Docs</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";

const router = useRouter();
</script>
