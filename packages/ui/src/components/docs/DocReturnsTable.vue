<template>
  <div class="my-6 overflow-x-auto">
    <table class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-dot-border">
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-medium" colspan="3">
            Returns
          </th>
        </tr>
        <tr class="border-b border-dot-border/50">
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-normal text-xs">Name</th>
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-normal text-xs">Type</th>
          <th class="text-left px-4 py-2.5 text-dot-text-tertiary font-normal text-xs">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="field in returns" :key="field.name" class="border-b border-dot-border/50">
          <td class="px-4 py-2.5">
            <code
              class="text-dot-accent text-xs font-mono bg-dot-surface-secondary px-1.5 py-0.5 rounded"
              >{{ field.name }}</code
            >
          </td>
          <td class="px-4 py-2.5">
            <code class="text-dot-text-secondary text-xs font-mono break-all">{{
              field.type
            }}</code>
          </td>
          <td class="px-4 py-2.5 text-dot-text-secondary break-words">{{ field.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
export interface ReturnField {
  name: string;
  type: string;
  description: string;
}

defineProps<{
  returns: ReturnField[];
}>();
</script>
