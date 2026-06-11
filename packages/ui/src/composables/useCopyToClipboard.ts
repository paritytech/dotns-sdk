import { useToast } from "vue-toastification";

// Copies text to the clipboard. Returns whether it succeeded so callers can show
// their own inline feedback; a success toast fires only when a message is given,
// while failures always toast.
export function useCopyToClipboard() {
  const toast = useToast();

  async function copy(text: string, successMessage?: string): Promise<boolean> {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      if (successMessage) toast.success(successMessage);
      return true;
    } catch {
      toast.error("Could not copy to clipboard");
      return false;
    }
  }

  return { copy };
}
