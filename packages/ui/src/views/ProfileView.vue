<template>
  <main class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 font-sans text-dot-text-primary">
    <div class="mb-12 text-center">
      <h1 class="text-4xl font-serif font-extrabold text-dot-text-primary mb-4">My Domains</h1>
    </div>

    <div class="mb-6 flex justify-between items-center flex-wrap gap-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search domains..."
        class="border border-dot-border rounded-lg px-4 py-2 w-full sm:w-1/3 bg-dot-surface text-dot-text-primary focus:ring-2 focus:ring-dot-accent/20 focus:outline-none"
        :disabled="isLoading"
      />
      <div class="flex gap-3" v-if="tlds.length > 0">
        <Button @click="openAddSubdomains" :disabled="isLoading"> Add Subdomain </Button>
        <Button
          variant="secondary"
          @click="openTransferModal"
          :disabled="isLoading || transferableTlds.length === 0"
        >
          Transfer Domain
        </Button>
      </div>
    </div>

    <div
      v-if="isLoading"
      class="overflow-x-auto border border-dot-border rounded-xl shadow-sm animate-pulse"
    >
      <table class="min-w-full divide-y divide-dot-border text-sm">
        <thead class="bg-dot-surface-secondary">
          <tr>
            <th v-for="i in 6" :key="i" class="px-6 py-3 text-left">
              <div class="h-4 bg-dot-border rounded w-24"></div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dot-border bg-dot-surface">
          <tr v-for="i in 5" :key="i" class="animate-pulse">
            <td v-for="j in 6" :key="j" class="px-6 py-3">
              <div class="h-4 bg-dot-border rounded w-20"></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else-if="allDomains.length === 0"
      class="border border-dot-border rounded-xl shadow-sm p-16 text-center"
    >
      <svg
        class="w-16 h-16 mx-auto mb-4 text-dot-text-tertiary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 class="text-lg font-medium text-dot-text-primary mb-2">No domains found</h3>
      <p class="text-dot-text-tertiary mb-6">Register your first domain to get started</p>
      <Button @click="router.replace('/')">Register Domain</Button>
    </div>

    <div v-else class="overflow-x-auto border border-dot-border rounded-xl shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-dot-border text-sm">
          <thead class="bg-dot-surface-secondary">
            <tr>
              <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Domain</th>
              <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Type</th>
              <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">
                <div class="flex items-center gap-2">
                  <span>PoP Requirement</span>

                  <div class="relative inline-flex items-center">
                    <button
                      ref="headerInfoButton"
                      type="button"
                      class="inline-flex items-center"
                      aria-label="Proof of Personhood info"
                      @mouseenter="showHeaderTooltip"
                      @mouseleave="hideHeaderTooltip"
                      @focus="showHeaderTooltip"
                      @blur="hideHeaderTooltip"
                    >
                      <Icon
                        name="Info"
                        size="sm"
                        class="text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                      />
                    </button>

                    <Teleport to="body">
                      <div
                        v-if="headerTooltipVisible"
                        ref="headerTooltipRef"
                        class="fixed z-[99999] pointer-events-none"
                        :style="headerTooltipStyle"
                      >
                        <div
                          class="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg max-w-xs"
                        >
                          <p class="font-semibold mb-1">Proof of Personhood (PoP)</p>
                          <p class="mb-2">
                            Verification system that confirms unique human identity without
                            revealing personal information.
                          </p>
                          <ul class="space-y-1 text-left">
                            <li>
                              • <span class="font-medium">Pop Full:</span>
                              Complete verification
                            </li>
                            <li>• <span class="font-medium">Pop Lite:</span> Basic verification</li>
                            <li>
                              • <span class="font-medium">No Status:</span>
                              Unverified
                            </li>
                            <li>
                              • <span class="font-medium">Reserved:</span>
                              Governance only
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Teleport>
                  </div>
                </div>
              </th>
              <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Status</th>
              <th class="px-6 py-3 text-left font-semibold text-dot-text-secondary">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-dot-border bg-dot-surface">
            <tr
              v-for="domain in paginatedDomains"
              :key="domain.name"
              class="hover:bg-dot-surface-secondary"
            >
              <td class="px-6 py-4 font-medium text-dot-text-primary">
                {{ domain.name }}
              </td>

              <td class="px-6 py-4">
                <span
                  class="px-2 py-1 text-xs rounded-full"
                  :class="
                    domain.type === 'TLD'
                      ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                      : 'bg-dot-border text-dot-text-secondary border border-dot-border'
                  "
                >
                  {{ domain.type }}
                </span>
              </td>

              <td class="px-6 py-4">
                <div v-if="domain.popRequirement" class="flex items-center gap-2">
                  <span
                    class="text-xs px-2 py-1 rounded-full"
                    :class="popStatusBadgeClass(domain.popRequirement.requirement)"
                  >
                    {{ PopStatusLabels[domain.popRequirement.requirement] }}
                  </span>

                  <div class="relative inline-flex items-center">
                    <button
                      :ref="(el) => setRowInfoButton(domain.name, el)"
                      type="button"
                      class="inline-flex items-center"
                      aria-label="PoP requirement details"
                      @mouseenter="showRowTooltip(domain.name)"
                      @mouseleave="hideRowTooltip(domain.name)"
                      @focus="showRowTooltip(domain.name)"
                      @blur="hideRowTooltip(domain.name)"
                    >
                      <svg
                        class="w-4 h-4 text-dot-text-tertiary hover:text-dot-text-secondary cursor-help"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </button>

                    <Teleport to="body">
                      <div
                        v-if="activeRowTooltip === domain.name"
                        :ref="(el) => setRowTooltipRef(domain.name, el)"
                        class="fixed z-[99999] pointer-events-none"
                        :style="rowTooltipStyles[domain.name] || {}"
                      >
                        <div
                          class="px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-normal max-w-xs"
                        >
                          <p class="font-semibold mb-1">
                            {{ PopStatusLabels[domain.popRequirement.requirement] }}
                          </p>
                          <p>{{ domain.popRequirement.message }}</p>
                        </div>
                      </div>
                    </Teleport>
                  </div>
                </div>

                <span v-else class="text-xs text-dot-text-tertiary">Loading...</span>
              </td>

              <td class="px-6 py-4">
                <span
                  class="px-2 py-1 text-xs rounded-full"
                  :class="
                    domain.isOwner
                      ? 'bg-dot-border-strong text-dot-text-primary border border-dot-border'
                      : 'bg-dot-surface-secondary text-dot-text-tertiary border border-dot-border'
                  "
                >
                  {{ domain.isOwner ? "Active" : "Not Owner" }}
                </span>
              </td>

              <td class="px-6 py-4">
                <div class="flex gap-2">
                  <Button size="sm" @click="openRecordEditor(domain.name)"> Edit </Button>
                  <Button size="sm" variant="secondary" @click="openResolve(domain.name)">
                    Resolve
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      v-if="!isLoading && allDomains.length > 0"
      class="flex justify-between items-center mt-4 text-sm text-dot-text-secondary"
    >
      <div>
        <label>Show</label>
        <select
          v-model.number="itemsPerPage"
          class="ml-2 border border-dot-border bg-dot-surface text-dot-text-primary rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-dot-accent/20"
        >
          <option :value="10">10</option>
          <option :value="30">30</option>
          <option :value="50">50</option>
        </select>
      </div>
      <div class="flex items-center gap-3">
        <Button size="sm" variant="outline" @click="prevPage" :disabled="currentPage === 1">
          ‹
        </Button>
        <span>Page {{ currentPage }} of {{ totalPages }}</span>
        <Button
          size="sm"
          variant="outline"
          @click="nextPage"
          :disabled="currentPage === totalPages"
        >
          ›
        </Button>
      </div>
    </div>

    <AddSubdomainModal
      :open="showAddModal?.open || false"
      @close="showAddModal = undefined"
      :tlds="tlds"
      @registered="handleSubdomainRegistered"
    />

    <TransferDomainModal
      :open="showTransferModal"
      @close="showTransferModal = false"
      :domains="transferableTlds"
      @transferred="handleDomainTransferred"
    />

    <TransactionStatus
      :open="showTransaction"
      :handle="selectedHandle"
      :transaction="transaction"
      @close="showTransaction = false"
    />

    <ResolveIPFSModal
      :open="showResolveModal"
      :name="selectedDomain"
      @close="showResolveModal = false"
      @save="saveResolve"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, watch } from "vue";
import { useWalletStore } from "@/store/useWalletStore";
import AddSubdomainModal from "../components/modals/AddSubdomainModal.vue";
import TransferDomainModal from "../components/modals/TransferDomainModal.vue";
import ResolveIPFSModal from "../components/modals/ResolveIPFSModal.vue";
import TransactionStatus from "../components/TransactionStatus.vue";
import type { MyDomain, TransactionResult, NameRequirement } from "@/type";
import { getAddress, zeroHash, zeroAddress } from "viem";
import { useRouter } from "vue-router";
import { useResolverStore } from "@/store/useResolverStore";
import { useUserStoreManager } from "@/store/useUserStoreManager";
import { useDomainStore } from "@/store/useDomainStore";
import { PopStatusLabels } from "@/type";
import { popStatusBadgeClass } from "@/lib/uiHelpers";
import { useTooltip, useTooltipManager } from "@/composables";
import Icon from "@/components/ui/Icon.vue";
import Button from "@/components/ui/Button.vue";

const wallet = useWalletStore();
const isLoading = ref(true);
const allDomains = ref<MyDomain[]>([]);
const searchQuery = ref("");
const showAddModal = ref<any>(null);
const showTransferModal = ref(false);
const showTransaction = ref(false);
const selectedHandle = ref("");
const transaction = ref<TransactionResult>({ hash: zeroHash, status: false });
const currentPage = ref(1);
const itemsPerPage = ref(10);
const tlds = ref<string[]>([]);
const router = useRouter();
const showResolveModal = ref(false);
const selectedDomain = ref("");
const resolverStore = useResolverStore();
const userStoreManager = useUserStoreManager();
const domainStore = useDomainStore();

// Header tooltip (single instance)
const {
  visible: headerTooltipVisible,
  buttonRef: headerInfoButton,
  tooltipRef: headerTooltipRef,
  style: headerTooltipStyle,
  show: showHeaderTooltip,
  hide: hideHeaderTooltip,
} = useTooltip();

// Suppress unused variable warnings for template refs
void headerInfoButton;
void headerTooltipRef;

// Row tooltips (multiple instances)
const {
  activeId: activeRowTooltip,
  setButtonRef: setRowInfoButton,
  setTooltipRef: setRowTooltipRef,
  styles: rowTooltipStyles,
  show: showRowTooltip,
  hide: hideRowTooltip,
} = useTooltipManager();

function openRecordEditor(name: string) {
  router.push(`/whois/${name}`);
}

function parseDotName(name: string): { parts: string[]; tldLabel: string } {
  const normalized = name.trim().toLowerCase();
  const withoutDot = normalized.endsWith(".dot") ? normalized.slice(0, -4) : normalized;
  const parts = withoutDot.split(".").filter(Boolean);
  const tldLabel = parts.length > 0 ? parts[parts.length - 1] : "";
  return { parts, tldLabel: tldLabel! };
}

function getDotLevel(name: string) {
  return parseDotName(name).parts.length;
}

function getType(name: string) {
  return getDotLevel(name) === 1 ? "TLD" : "Subdomain";
}

async function isCurrentUserOwner(name: string, type: "TLD" | "Subdomain"): Promise<boolean> {
  if (!wallet.evmAddress) return false;

  if (type === "Subdomain") {
    try {
      const currentOwner = await resolverStore.getOwnerOfDomain(name);
      if (!currentOwner || currentOwner === zeroAddress) return true;
      return getAddress(wallet.evmAddress) === getAddress(currentOwner);
    } catch {
      return true;
    }
  }

  try {
    const currentOwner = await resolverStore.getOwnerOfDomain(name);
    if (!currentOwner || currentOwner === zeroAddress) return false;
    return getAddress(wallet.evmAddress) === getAddress(currentOwner);
  } catch {
    return false;
  }
}

watch(
  () => wallet.isConnected,
  (v) => v && loadDomains(),
);

onBeforeMount(() => {
  if (wallet.isConnected) {
    loadDomains();
  } else {
    return router.replace("/");
  }
});

const filteredDomains = computed(() =>
  allDomains.value.filter((d) => d.name.toLowerCase().includes(searchQuery.value.toLowerCase())),
);

const totalPages = computed(
  () => Math.ceil(filteredDomains.value.length / itemsPerPage.value) || 1,
);

const paginatedDomains = computed(() =>
  filteredDomains.value.slice(
    (currentPage.value - 1) * itemsPerPage.value,
    currentPage.value * itemsPerPage.value,
  ),
);

const transferableTlds = computed(() =>
  allDomains.value.filter((d) => d.type === "TLD" && d.isOwner).map((d) => d.name),
);

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function openAddSubdomains() {
  if (tlds.value.length > 0) showAddModal.value = { open: true, tld: "", tlds };
}

function openTransferModal() {
  showTransferModal.value = true;
}

function openResolve(domain: string) {
  selectedDomain.value = domain;
  showResolveModal.value = true;
}

async function saveResolve(hash: string) {
  showResolveModal.value = false;
  showTransaction.value = true;
  transaction.value = { hash: zeroHash, status: undefined };

  try {
    const tx = await resolverStore.setContentHash(selectedDomain.value, hash);
    transaction.value = tx;
  } catch {
    transaction.value = { hash: zeroHash, status: false };
  }
}

function handleSubdomainRegistered(transactionStatus: TransactionResult) {
  transaction.value = transactionStatus;
  showAddModal.value = undefined;
  showTransaction.value = true;
  loadDomains();
}

function handleDomainTransferred() {
  loadDomains();
}

async function loadDomains() {
  isLoading.value = true;

  try {
    const names = await userStoreManager.getSubdomains();

    const results = (await Promise.all(
      names.map(async (name) => {
        try {
          const type = getType(name) as "TLD" | "Subdomain";
          const isOwner = await isCurrentUserOwner(name, type);

          if (type === "TLD" && !isOwner) return null;

          let popRequirement: NameRequirement | null = null;
          try {
            const { tldLabel } = parseDotName(name);
            if (tldLabel) popRequirement = await domainStore.classifyName(tldLabel);
          } catch (error) {
            console.warn(`Failed to fetch PoP requirement for ${name}:`, error);
          }

          return {
            name,
            type,
            isOwner,
            needsResolver: false,
            popRequirement,
            expiry: "",
            statusIcon: "check",
            statusLabel: isOwner ? "Active" : "Not Owner",
          };
        } catch (error) {
          console.warn(`Failed to process domain ${name}:`, error);
          return null;
        }
      }),
    )) as Array<(MyDomain & { popRequirement: NameRequirement | null }) | null>;

    allDomains.value = results.filter(
      (d): d is MyDomain & { popRequirement: NameRequirement | null } => d !== null,
    );

    tlds.value = allDomains.value.filter((d) => d.type === "TLD" && d.isOwner).map((d) => d.name);
  } catch (error) {
    console.warn("Failed to load domains:", error);
    allDomains.value = [];
    tlds.value = [];
  } finally {
    isLoading.value = false;
  }
}
</script>
