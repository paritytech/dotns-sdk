<template>
  <Modal :open="open" size="md" @close="$emit('close')">
    <div class="font-sans text-dot-text-primary">
      <h2 class="text-xl font-semibold mb-4">Edit Profile Records</h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1">Twitter Handle</label>
          <input
            v-model="local.twitter"
            type="text"
            placeholder="username"
            :class="[
              'w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-dot-accent/20',
              errors.twitter ? 'border-error' : 'border-dot-border',
            ]"
          />
          <p v-if="errors.twitter" class="text-error text-xs mt-1">
            {{ errors.twitter }}
          </p>
        </div>

        <div>
          <label class="block text-sm text-dot-text-secondary mb-1">GitHub Handle</label>
          <input
            v-model="local.github"
            type="text"
            placeholder="username"
            :class="[
              'w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-dot-accent/20',
              errors.github ? 'border-error' : 'border-dot-border',
            ]"
          />
          <p v-if="errors.github" class="text-error text-xs mt-1">
            {{ errors.github }}
          </p>
        </div>

        <div>
          <label class="block text-sm text-dot-text-secondary mb-1">Description</label>
          <textarea
            v-model="local.description"
            rows="3"
            maxlength="200"
            placeholder="Tell us about yourself..."
            :class="[
              'w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-dot-accent/20',
              errors.description ? 'border-error' : 'border-dot-border',
            ]"
          ></textarea>
          <p v-if="errors.description" class="text-error text-xs mt-1">
            {{ errors.description }}
          </p>
          <p v-else class="text-dot-text-tertiary text-xs mt-1">
            {{ local.description.length }}/200 characters
          </p>
        </div>

        <div>
          <label class="block text-sm text-dot-text-secondary mb-1">Personal Website</label>
          <input
            v-model="local.url"
            type="text"
            placeholder="https://example.com"
            :class="[
              'w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-dot-accent/20',
              errors.url ? 'border-error' : 'border-dot-border',
            ]"
          />
          <p v-if="errors.url" class="text-error text-xs mt-1">
            {{ errors.url }}
          </p>
        </div>
      </div>

      <div class="flex justify-between mt-8">
        <Button variant="outline" @click="$emit('close')"> Cancel </Button>

        <Button variant="primary" @click="handleSave" :disabled="!canSave"> Save </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Modal from "@/components/ui/Modal.vue";

interface Props {
  open: boolean;
  twitter: string | null;
  github: string | null;
  description: string | null;
  url: string | null;
  name: string;
}

const props = defineProps<Props>();
const emit = defineEmits(["close", "save"]);

const local = ref({
  twitter: props.twitter ?? "",
  github: props.github ?? "",
  description: props.description ?? "",
  url: props.url ?? "",
});

const errors = ref({
  twitter: "",
  github: "",
  description: "",
  url: "",
});

watch(
  () => props.open,
  (v) => {
    if (v) {
      local.value = {
        twitter: props.twitter ?? "",
        github: props.github ?? "",
        description: props.description ?? "",
        url: props.url ?? "",
      };
      clearErrors();
    }
  },
);

function clearErrors() {
  errors.value.twitter = "";
  errors.value.github = "";
  errors.value.description = "";
  errors.value.url = "";
}

function validate() {
  clearErrors();

  if (local.value.twitter && !/^[A-Za-z0-9_]{1,15}$/.test(local.value.twitter)) {
    errors.value.twitter =
      "Invalid Twitter handle (alphanumeric and underscore, max 15 characters)";
  }

  if (local.value.github) {
    const gh = local.value.github;
    if (gh.length > 39) {
      errors.value.github = "GitHub handle must be 39 characters or less";
    } else if (!/^[a-zA-Z0-9]/.test(gh) || !/[a-zA-Z0-9]$/.test(gh)) {
      errors.value.github = "GitHub handle cannot start or end with a hyphen";
    } else if (/--/.test(gh)) {
      errors.value.github = "GitHub handle cannot contain consecutive hyphens";
    } else if (!/^[a-zA-Z0-9-]+$/.test(gh)) {
      errors.value.github = "GitHub handle may only contain alphanumeric characters or hyphens";
    }
  }

  if (local.value.description) {
    if (local.value.description.length < 10) {
      errors.value.description = "Description must be at least 10 characters";
    } else if (local.value.description.length > 200) {
      errors.value.description = "Description must be 200 characters or less";
    }
  }

  if (local.value.url && !/^https?:\/\/.+\..+/.test(local.value.url)) {
    errors.value.url = "URL must be a valid web address starting with http:// or https://";
  }
}

const canSave = computed(() => {
  validate();
  return (
    !errors.value.twitter && !errors.value.github && !errors.value.description && !errors.value.url
  );
});

function handleSave() {
  if (!canSave.value) return;
  emit("save", { ...local.value });
}
</script>
