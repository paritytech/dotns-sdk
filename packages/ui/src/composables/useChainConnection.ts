import { onMounted } from "vue";
import { useToast, TYPE } from "vue-toastification";
import ChainStatusToast from "@/components/ChainStatusToast.vue";
import { getChainClient } from "@/composables/useTypedAPI";
import { withTimeout, TimeoutError } from "@/lib/withTimeout";

const CHAIN_PROBE_TIMEOUT_MS = 30_000;

// Surfaces a dismiss-free toast (with a Refresh action) when the chain cannot be
// reached or a read takes too long, so a hung RPC never leaves the UI silently
// blank. notifyChainUnreachable is shared so individual long reads can reuse it.
export function useChainConnection() {
  const toast = useToast();

  function notifyChainUnreachable(message: string): void {
    toast(
      { component: ChainStatusToast, props: { message } },
      { type: TYPE.INFO, timeout: false, closeOnClick: false, draggable: false },
    );
  }

  onMounted(async () => {
    try {
      await withTimeout(getChainClient(), CHAIN_PROBE_TIMEOUT_MS);
    } catch (error) {
      notifyChainUnreachable(
        error instanceof TimeoutError
          ? "The network is taking too long to respond. Try refreshing."
          : "Unable to reach the network. Check your connection and refresh.",
      );
    }
  });

  return { notifyChainUnreachable };
}
