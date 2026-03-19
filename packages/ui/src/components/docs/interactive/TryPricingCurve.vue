<template>
  <DocTabs :tabs="['Interactive', 'Code']">
    <template #tab-0>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-dot-text-secondary mb-1.5"
            >Type a name to see where it falls on the pricing curve</label
          >
          <div class="flex gap-2">
            <input
              v-model="name"
              @input="lookup"
              type="text"
              placeholder="domainname"
              class="flex-1 bg-dot-surface border border-dot-border rounded-lg px-3 py-2 text-sm text-dot-text-primary placeholder:text-dot-text-tertiary focus:outline-none focus:border-dot-accent focus:ring-2 focus:ring-dot-accent/30 transition-colors"
            />
          </div>
        </div>

        <div
          v-if="fetchStatus === 'loading'"
          class="p-4 rounded-lg border border-dot-border bg-dot-surface"
        >
          <div class="flex items-center gap-2">
            <Loader size="xs" />
            <span class="text-sm text-dot-text-secondary">Fetching price&hellip;</span>
          </div>
        </div>

        <div
          v-if="fetchStatus === 'error'"
          class="p-4 rounded-lg border border-error/30 bg-error/5 space-y-1"
        >
          <p class="text-sm font-medium text-error">Lookup failed</p>
          <p class="text-xs text-error/80">{{ errorMsg }}</p>
        </div>

        <!-- SVG Chart -->
        <div class="w-full overflow-hidden">
          <svg
            :viewBox="`0 0 ${chart.w} ${chart.h}`"
            class="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <!-- Grid lines -->
            <line
              v-for="tick in yTicks"
              :key="'grid-' + tick"
              :x1="chart.left"
              :y1="toY(tick)"
              :x2="chart.right"
              :y2="toY(tick)"
              stroke="var(--color-dot-border)"
              stroke-width="0.5"
              stroke-dasharray="4 4"
            />

            <!-- PoP-gated zone (length < 9) -->
            <rect
              :x="chart.left"
              :y="chart.top"
              :width="toX(9) - chart.left"
              :height="chart.bottom - chart.top"
              fill="var(--color-dot-surface-secondary)"
              opacity="0.5"
            />
            <text
              :x="(chart.left + toX(9)) / 2"
              :y="chart.top + 20"
              text-anchor="middle"
              class="fill-dot-text-tertiary text-[10px]"
            >
              PoP Required
            </text>

            <!-- Price floor zone (length >= 15) -->
            <line
              :x1="toX(15)"
              :y1="toY(floorPrice)"
              :x2="chart.right"
              :y2="toY(floorPrice)"
              stroke="var(--color-warning)"
              stroke-width="1.5"
              stroke-dasharray="6 3"
            />
            <text
              :x="chart.right - 4"
              :y="toY(floorPrice) - 6"
              text-anchor="end"
              class="fill-warning text-[9px]"
            >
              Floor: {{ floorPrice }} DOT
            </text>

            <!-- Linear decay line (9-14) -->
            <polyline
              :points="decayPoints"
              fill="none"
              stroke="var(--color-dot-accent)"
              stroke-width="2"
              stroke-linejoin="round"
            />

            <!-- Static data points (9-14) -->
            <circle
              v-for="pt in dataPoints"
              :key="'pt-' + pt.length"
              :cx="toX(pt.length)"
              :cy="toY(pt.price)"
              :r="onChainResult && pt.length === activeLength ? 6 : 3.5"
              :class="
                onChainResult && pt.length === activeLength
                  ? 'fill-dot-accent animate-pulse-ring'
                  : 'fill-dot-accent'
              "
              stroke="var(--color-dot-surface)"
              stroke-width="1.5"
            />

            <!-- Active floor data point (15+, on-chain) -->
            <circle
              v-if="onChainResult && isOpenName && activeLength >= 15"
              :cx="toX(Math.min(activeLength, 20))"
              :cy="toY(onChainPriceFloat)"
              r="6"
              class="fill-warning animate-pulse-ring"
              stroke="var(--color-dot-surface)"
              stroke-width="1.5"
            />

            <!-- Active price label (on-chain, open names) -->
            <g v-if="onChainResult && isOpenName && onChainPriceFloat > 0">
              <rect
                :x="activeLabelX - 32"
                :y="activeLabelY - 22"
                width="64"
                height="18"
                rx="4"
                class="fill-dot-surface-secondary"
                stroke="var(--color-dot-border)"
                stroke-width="0.5"
              />
              <text
                :x="activeLabelX"
                :y="activeLabelY - 10"
                text-anchor="middle"
                class="fill-dot-text-primary text-[10px] font-mono font-bold"
              >
                {{ formattedPrice }} DOT
              </text>
            </g>

            <!-- PoP-gated active indicator (on-chain) -->
            <g v-if="onChainResult && !isOpenName && activeLength > 0">
              <circle
                :cx="toX(Math.min(activeLength, 8))"
                :cy="toY(0) - 2"
                r="6"
                :class="statusDotClass"
                stroke="var(--color-dot-surface)"
                stroke-width="1.5"
              />
              <text
                :x="toX(Math.min(activeLength, 8))"
                :y="toY(0) - 14"
                text-anchor="middle"
                :class="statusTextClass"
              >
                {{ statusChartLabel }}
              </text>
            </g>

            <!-- X-axis -->
            <line
              :x1="chart.left"
              :y1="chart.bottom"
              :x2="chart.right"
              :y2="chart.bottom"
              stroke="var(--color-dot-border)"
              stroke-width="1"
            />
            <g v-for="x in xTicks" :key="'x-' + x">
              <line
                :x1="toX(x)"
                :y1="chart.bottom"
                :x2="toX(x)"
                :y2="chart.bottom + 4"
                stroke="var(--color-dot-border)"
                stroke-width="1"
              />
              <text
                :x="toX(x)"
                :y="chart.bottom + 16"
                text-anchor="middle"
                class="fill-dot-text-tertiary text-[10px] font-mono"
              >
                {{ x }}
              </text>
            </g>
            <text
              :x="(chart.left + chart.right) / 2"
              :y="chart.h - 2"
              text-anchor="middle"
              class="fill-dot-text-tertiary text-[10px]"
            >
              Name Length (chars)
            </text>

            <!-- Y-axis -->
            <line
              :x1="chart.left"
              :y1="chart.top"
              :x2="chart.left"
              :y2="chart.bottom"
              stroke="var(--color-dot-border)"
              stroke-width="1"
            />
            <g v-for="y in yTicks" :key="'y-' + y">
              <text
                :x="chart.left - 6"
                :y="toY(y) + 3"
                text-anchor="end"
                class="fill-dot-text-tertiary text-[10px] font-mono"
              >
                {{ y.toFixed(3) }}
              </text>
            </g>
            <text
              :x="4"
              :y="(chart.top + chart.bottom) / 2"
              text-anchor="middle"
              class="fill-dot-text-tertiary text-[10px]"
              :transform="`rotate(-90, 4, ${(chart.top + chart.bottom) / 2})`"
            >
              Price (DOT)
            </text>
          </svg>
        </div>

        <!-- Live breakdown (on-chain) -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div
            v-if="onChainResult && activeLength > 0"
            class="p-4 rounded-lg border border-dot-border bg-dot-surface space-y-3"
          >
            <div class="flex items-center gap-3">
              <span class="px-3 py-1 rounded-full text-xs font-bold" :class="statusBadgeClass">
                {{ statusLabel }}
              </span>
              <span class="text-sm text-dot-text-primary font-medium">{{ lastQueried }}.dot</span>
            </div>
            <p class="text-sm text-dot-text-secondary">{{ onChainResult.message }}</p>
            <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs text-dot-text-tertiary">
              <span>
                Length:
                <span class="text-dot-text-primary font-mono font-medium">{{ activeLength }}</span>
              </span>
              <span v-if="isOpenName">
                Price:
                <span class="text-dot-accent font-mono font-bold">{{ formattedPrice }} DOT</span>
              </span>
            </div>
          </div>
        </Transition>
      </div>
    </template>
    <template #tab-1>
      <DocCodeBlock :code="solidityCode" lang="solidity" filename="PopRules.sol" />
    </template>
  </DocTabs>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { encodeFunctionData, decodeFunctionResult, zeroAddress } from "viem";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useTransactionStore } from "@/store/useTransactionStore";
import { useAbiStore } from "@/store/useAbiStore";
import { ZERO_SUBSTRATE_ADDRESS } from "@/lib/networks";
import { PopStatus, type PriceWithMeta } from "@/type";
import { formatWeiAsEther } from "@/lib/currency";
import Loader from "@/components/ui/Loader.vue";
import DocTabs from "../DocTabs.vue";
import DocCodeBlock from "../DocCodeBlock.vue";

const networkStore = useNetworkStore();
const transactionStore = useTransactionStore();
const abiStore = useAbiStore();

const name = ref("");
const onChainResult = ref<PriceWithMeta | null>(null);
const fetchStatus = ref<"idle" | "loading" | "result" | "error">("idle");
const errorMsg = ref("");
const lastQueried = ref("");

const cleanName = computed(() =>
  name.value
    .trim()
    .replace(/\.dot$/, "")
    .toLowerCase(),
);

const activeLength = computed(() => cleanName.value.length);

// Static chart constants
const startingPrice = 0.002;
const floorPrice = startingPrice / 2;
const chart = { w: 400, h: 220, top: 20, bottom: 185, left: 55, right: 385 };
const xTicks = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const yTicks = [0, 0.002, 0.004, 0.006, 0.008, 0.01, 0.012];

// Static data points for the curve shape
const dataPoints = computed(() => {
  const points: { length: number; price: number }[] = [];
  for (let len = 9; len <= 14; len++) {
    points.push({ length: len, price: startingPrice * (15 - len) });
  }
  return points;
});

const decayPoints = computed(() =>
  dataPoints.value.map((pt) => `${toX(pt.length)},${toY(pt.price)}`).join(" "),
);

// On-chain derived values
const onChainPriceFloat = computed(() => {
  if (!onChainResult.value) return 0;
  return Number(onChainResult.value.price) / 1e18;
});

const isOpenName = computed(() => {
  if (!onChainResult.value) return false;
  return onChainResult.value.status === PopStatus.NoStatus;
});

const formattedPrice = computed(() => {
  if (!onChainResult.value) return "0";
  return formatWeiAsEther(onChainResult.value.price);
});

const statusLabel = computed(() => {
  if (!onChainResult.value) return "";
  switch (onChainResult.value.status) {
    case PopStatus.NoStatus:
      return "Open";
    case PopStatus.PopLite:
      return "PoP Lite";
    case PopStatus.PopFull:
      return "PoP Full";
    case PopStatus.Reserved:
      return "Reserved";
    default:
      return "Unknown";
  }
});

const statusBadgeClass = computed(() => {
  if (!onChainResult.value) return "";
  switch (onChainResult.value.status) {
    case PopStatus.NoStatus:
      return "bg-success/10 text-success";
    case PopStatus.PopLite:
      return "bg-dot-accent-soft text-dot-accent";
    case PopStatus.PopFull:
      return "bg-warning/10 text-warning";
    case PopStatus.Reserved:
      return "bg-error/10 text-error";
    default:
      return "bg-dot-surface-secondary text-dot-text-secondary";
  }
});

const statusDotClass = computed(() => {
  if (!onChainResult.value) return "";
  return onChainResult.value.status === PopStatus.Reserved
    ? "fill-error animate-pulse-ring"
    : "fill-warning animate-pulse-ring";
});

const statusTextClass = computed(() => {
  if (!onChainResult.value) return "";
  return onChainResult.value.status === PopStatus.Reserved
    ? "fill-error text-[10px] font-bold"
    : "fill-warning text-[10px] font-bold";
});

const statusChartLabel = computed(() => {
  if (!onChainResult.value) return "";
  switch (onChainResult.value.status) {
    case PopStatus.PopLite:
      return "PoP Lite";
    case PopStatus.PopFull:
      return "PoP Full";
    case PopStatus.Reserved:
      return "Reserved";
    default:
      return "PoP";
  }
});

const activeLabelX = computed(() => {
  if (activeLength.value >= 15) return toX(Math.min(activeLength.value, 20));
  return toX(activeLength.value);
});

const activeLabelY = computed(() => toY(onChainPriceFloat.value));

function toX(len: number): number {
  const minX = 5;
  const maxX = 20;
  return chart.left + ((len - minX) / (maxX - minX)) * (chart.right - chart.left);
}

function toY(price: number): number {
  const maxY = 0.013;
  return chart.bottom - (price / maxY) * (chart.bottom - chart.top);
}

// On-chain lookup via priceWithoutCheck
let debounceTimer: ReturnType<typeof setTimeout>;

function lookup() {
  clearTimeout(debounceTimer);
  const input = cleanName.value;
  if (!input) {
    onChainResult.value = null;
    fetchStatus.value = "idle";
    return;
  }

  debounceTimer = setTimeout(async () => {
    lastQueried.value = input;
    fetchStatus.value = "loading";
    errorMsg.value = "";

    try {
      await abiStore.ensureAbis();
      const client = await networkStore.getClient();
      const network = networkStore.currentNetwork;
      if (!network?.popOracle) throw new Error("PopOracle not configured");

      const data = encodeFunctionData({
        abi: abiStore.getABI("PopRules"),
        functionName: "priceWithoutCheck",
        args: [input, zeroAddress],
      });

      const resultData = await transactionStore.ethCall(
        client,
        ZERO_SUBSTRATE_ADDRESS,
        network.popOracle,
        data,
      );

      if (!resultData || resultData === "0x") {
        throw new Error("Contract returned empty result");
      }

      const decoded = decodeFunctionResult({
        abi: abiStore.getABI("PopRules"),
        functionName: "priceWithoutCheck",
        data: resultData,
      }) as PriceWithMeta;

      onChainResult.value = decoded;
      fetchStatus.value = "result";
    } catch (e) {
      errorMsg.value = e instanceof Error ? e.message : "Unknown error";
      fetchStatus.value = "error";
    }
  }, 300);
}

const solidityCode = `/// @notice Returns the registration price for a name based on its length.
/// Names shorter than 9 characters are PoP-gated (free if eligible).
/// Names 15+ characters get a floor price of startingPrice / 2.
/// Names 9-14 characters pay a linear fee: startingPrice * (15 - length).
function price(string calldata name) public view returns (uint256) {
    uint256 namelength = name.strlen();
    if (namelength < 9) return 0;
    if (namelength >= 15) return startingPrice / 2;
    return startingPrice * (15 - namelength);
}

// Default: startingPrice = 0.002 DOT (2e15 wei)
// The startingPrice is set via initialize() and can be updated by governance.`;
</script>
