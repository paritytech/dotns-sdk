<template>
  <table class="min-w-full table-fixed divide-y divide-dot-border text-sm">
    <thead class="bg-dot-surface-secondary">
      <tr>
        <th class="px-6 py-3 text-left font-medium text-dot-text-secondary w-[220px]">Domain</th>
        <th class="px-6 py-3 text-left font-medium text-dot-text-secondary w-[120px]">Type</th>
        <th class="px-6 py-3 text-left font-medium text-dot-text-secondary w-[160px]">Expiry</th>
        <th class="px-6 py-3 text-left font-medium text-dot-text-secondary w-[140px]">Status</th>
        <th
          v-if="showActions"
          class="px-6 py-3 text-right font-medium text-dot-text-secondary w-[280px]"
        >
          Actions
        </th>
      </tr>
    </thead>

    <tbody class="divide-y divide-dot-border bg-dot-surface">
      <tr
        v-for="domain in domains"
        :key="domain.name"
        class="hover:bg-dot-surface-secondary transition"
      >
        <td class="px-6 py-3 font-medium text-dot-text-primary truncate">
          {{ domain.name }}
        </td>

        <td class="px-6 py-3 text-dot-text-secondary">
          {{ domain.type }}
        </td>

        <td class="px-6 py-3 text-dot-text-secondary">
          {{ domain.expiry }}
        </td>

        <td class="px-6 py-3">
          <span class="inline-flex items-center gap-2 text-xs font-medium text-dot-text-secondary">
            <Icon
              v-if="domain.statusIcon === 'check'"
              name="Check"
              size="sm"
              class="text-dot-text-tertiary"
            />

            <Icon
              v-else-if="domain.statusIcon === 'clock'"
              name="Clock"
              size="sm"
              class="text-dot-text-tertiary"
            />

            <Icon
              v-else-if="domain.statusIcon === 'x'"
              name="X"
              size="sm"
              class="text-dot-text-tertiary"
            />

            {{ domain.statusLabel }}
          </span>
        </td>

        <td v-if="showActions" class="px-6 py-3 text-right">
          <div class="inline-flex items-center gap-2 justify-start w-[260px]">
            <button
              v-if="domain.needsResolver && domain.isOwner"
              @click="$emit('setup', domain.name)"
              class="px-3 py-1.5 text-sm font-medium text-dot-text-secondary rounded-md hover:bg-dot-surface-secondary transition-colors"
            >
              Add Resolver
            </button>

            <button
              v-if="domain.isOwner"
              @click="$emit('edit', domain.name)"
              class="px-3 py-1.5 text-sm font-medium text-dot-text-secondary rounded-md hover:bg-dot-surface-secondary transition-colors"
            >
              Edit
            </button>

            <button
              v-if="
                domain.type === 'TLD' &&
                (domain.statusLabel === 'Active' || domain.statusLabel === 'Grace Period')
              "
              @click="$emit('renew', domain.name)"
              class="px-3 py-1.5 text-sm font-medium text-dot-text-secondary rounded-md hover:bg-dot-surface-secondary transition-colors"
            >
              Renew
            </button>

            <button
              v-else-if="domain.statusLabel === 'Expired'"
              @click="$emit('register', domain.name)"
              class="px-3 py-1.5 text-sm font-medium text-dot-text-secondary rounded-md hover:bg-dot-surface-secondary transition-colors"
            >
              Register
            </button>

            <button
              v-if="domain.isOwner && !domain.needsResolver"
              @click="$emit('resolve', domain.name)"
              class="px-3 py-1.5 text-sm font-medium text-dot-text-secondary rounded-md hover:bg-dot-surface-secondary transition-colors"
            >
              Resolve
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import type { MyDomain } from "@/type";
import Icon from "@/components/ui/Icon.vue";

defineProps<{
  domains: MyDomain[];
  showActions: boolean;
}>();

defineEmits(["renew", "register", "edit", "resolve", "setup"]);
</script>
