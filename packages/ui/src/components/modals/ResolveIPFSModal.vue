<template>
  <Modal :open="open" size="md" @close="$emit('close')">
    <div class="font-sans text-dot-text-primary">
      <h2 class="text-xl font-semibold mb-4">Resolve to IPFS</h2>

      <label class="block text-sm text-dot-text-secondary mb-1">IPFS Hash or Gateway URL</label>
      <input
        v-model="hash"
        type="text"
        placeholder="Qm... or bafy... or https://....ipfs.dweb.link/"
        :class="[
          'w-full border rounded-lg px-3 py-2 focus:ring-2 mb-1 transition',
          isInvalid && hash.length > 0
            ? 'border-error focus:ring-error/30'
            : 'border-dot-border focus:ring-dot-accent/20',
        ]"
      />
      <p v-if="isInvalid && hash.length > 0" class="text-error text-xs mb-4">
        Invalid IPFS hash or gateway URL
      </p>
      <p
        v-else-if="extractedHash && extractedHash !== hash.trim()"
        class="text-success text-xs mb-4"
      >
        Extracted: {{ extractedHash }}
      </p>
      <p v-else-if="extractedHash" class="text-success text-xs mb-4">Valid IPFS hash</p>
      <p v-else class="text-dot-text-tertiary text-xs mb-4">
        Enter a CID directly or paste a gateway URL
      </p>

      <div class="flex justify-between mt-6">
        <Button variant="outline" @click="$emit('close')"> Cancel </Button>

        <Button variant="primary" @click="submit" :disabled="!isValid"> Save </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import Button from "@/components/ui/Button.vue";
import Modal from "@/components/ui/Modal.vue";

const props = defineProps<{
  open: boolean;
  name: string;
}>();

const emit = defineEmits(["close", "save"]);

const hash = ref("");

function extractIPFSHash(input: string): string | null {
  const trimmed = input.trim();

  const rawCID = validateRawCID(trimmed);
  if (rawCID) return rawCID;

  try {
    const url = new URL(trimmed);

    const subdomainMatch = url.hostname.match(
      /^(bafy[a-z2-7]+|bafk[a-z2-7]+|bafz[a-z2-7]+|Qm[1-9A-HJ-NP-Za-km-z]{44})\.ipfs\./i,
    );
    if (subdomainMatch?.[1]) {
      return validateRawCID(subdomainMatch[1]);
    }

    const pathMatch = url.pathname.match(
      /\/ipfs\/(bafy[a-z2-7]+|bafk[a-z2-7]+|bafz[a-z2-7]+|Qm[1-9A-HJ-NP-Za-km-z]{44})/i,
    );
    if (pathMatch?.[1]) {
      return validateRawCID(pathMatch[1]);
    }
  } catch (error) {
    console.warn("Invalid URL:", error);
  }

  return null;
}

function validateRawCID(cid: string): string | null {
  const cidv0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
  if (cidv0Regex.test(cid)) return cid;

  const cidv1Regex = /^(bafy|bafk|bafz|bafy2|bafk2|bafm|bagq)[a-z2-7]{10,}$/i;
  if (cidv1Regex.test(cid)) return cid;

  return null;
}

const extractedHash = computed(() => {
  if (hash.value.length === 0) return null;
  return extractIPFSHash(hash.value);
});

const isValid = computed(() => extractedHash.value !== null);

const isInvalid = computed(() => !isValid.value && hash.value.length > 0);

watch(
  () => props.open,
  (v) => {
    if (v) hash.value = "";
  },
);

function submit() {
  if (isValid.value && extractedHash.value) {
    emit("save", extractedHash.value);
  }
}
</script>
