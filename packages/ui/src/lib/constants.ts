/**
 * Commonly used constants exported for component use
 * These are the raw values from our theme for use in dynamic styles
 */

import { theme } from "./theme";

// Export individual color values for easy import
export const COLORS = {
  PRIMARY: theme.colors.primary.DEFAULT,
  PRIMARY_HOVER: theme.colors.primary.hover,
  PRIMARY_LIGHT: theme.colors.primary.light,
  PRIMARY_GRADIENT_START: theme.colors.primary.gradient.start,
  PRIMARY_GRADIENT_END: theme.colors.primary.gradient.end,

  SUCCESS: theme.colors.success.DEFAULT,
  SUCCESS_LIGHT: theme.colors.success.light,

  ERROR: theme.colors.error.DEFAULT,
  ERROR_LIGHT: theme.colors.error.light,

  WARNING: theme.colors.warning.DEFAULT,
  WARNING_LIGHT: theme.colors.warning.light,
} as const;

// Export z-index values for programmatic use
export const Z_INDEX = theme.zIndex;

// Export transition durations for programmatic use
export const TRANSITIONS = theme.transitions;

// Re-export the full theme for advanced use cases
export { theme };
