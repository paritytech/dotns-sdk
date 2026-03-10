import { PopStatus } from "@/type";

/**
 * UI Helper Utilities
 *
 * Shared functions for UI components
 */

/**
 * Get Tailwind classes for PoP status badge
 *
 * @param status - PoP status
 * @returns Tailwind CSS classes for badge styling
 */
export function popStatusBadgeClass(status: PopStatus): string {
  switch (status) {
    case PopStatus.PopFull:
      return "bg-dot-border-strong text-dot-text-primary border border-dot-text-tertiary";
    case PopStatus.PopLite:
      return "bg-dot-border text-dot-text-secondary border border-dot-border";
    case PopStatus.Reserved:
      return "bg-dot-surface-secondary text-dot-text-tertiary border border-dot-border";
    case PopStatus.NoStatus:
    default:
      return "bg-dot-surface-secondary text-dot-text-secondary border border-dot-border";
  }
}
