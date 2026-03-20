/**
 * Design tokens for the Dotns UI theme
 * These constants define the core visual language of the application
 */

export const colors = {
  // Brand colors
  primary: {
    DEFAULT: "#f5f5f4", // Inverted greyscale CTA (stone-100)
    hover: "#e7e5e4", // stone-200
    light: "#292524", // dark equivalent
    gradient: {
      start: "#78716c", // stone-500
      end: "#d6d3d1", // stone-300
    },
  },

  // Semantic colors
  success: {
    DEFAULT: "#16c172", // matches dotns-main
    light: "#dcfce7", // green-100
  },

  error: {
    DEFAULT: "#dc2626", // red-600
    light: "#fee2e2", // red-100
  },

  warning: {
    DEFAULT: "#ea580c", // orange-600
    light: "#ffedd5", // orange-100
  },

  // Neutral colors (referencing Tailwind's gray scale)
  neutral: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
} as const;

export const spacing = {
  // Common spacing values used throughout the app
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
} as const;

export const borderRadius = {
  sm: "0.375rem", // 6px
  md: "0.5rem", // 8px
  lg: "0.75rem", // 12px
  xl: "1rem", // 16px
  full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
} as const;

export const transitions = {
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
  slower: "500ms",
} as const;

export const animations = {
  // Loader animations
  loaderRotate: {
    keyframes: {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" },
    },
    duration: "1.6s",
    timing: "linear",
    iteration: "infinite",
  },
  loaderDash: {
    keyframes: {
      "0%": {
        strokeDasharray: "1, 260",
        strokeDashoffset: "0",
      },
      "50%": {
        strokeDasharray: "180, 260",
        strokeDashoffset: "-90",
      },
      "100%": {
        strokeDasharray: "180, 260",
        strokeDashoffset: "-280",
      },
    },
    duration: "1.6s",
    timing: "ease-in-out",
    iteration: "infinite",
  },
  // Loading bar animation
  loadingBar: {
    keyframes: {
      "0%": { transform: "translateX(-100%)" },
      "100%": { transform: "translateX(100%)" },
    },
    duration: "2s",
    timing: "linear",
    iteration: "infinite",
  },
  // Spin animation (for spinners)
  spin: {
    keyframes: {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" },
    },
    duration: "1s",
    timing: "linear",
    iteration: "infinite",
  },
  // Pulse animations
  pulseDot: {
    keyframes: {
      "0%": { transform: "scale(1.4)" },
      "50%": { transform: "scale(1.8)" },
      "100%": { transform: "scale(1.4)" },
    },
    duration: "1.2s",
    timing: "ease-in-out",
    iteration: "infinite",
  },
  pulseRing: {
    keyframes: {
      "0%": { transform: "scale(1)", opacity: "1" },
      "50%": { transform: "scale(1.04)", opacity: "0.7" },
      "100%": { transform: "scale(1)", opacity: "1" },
    },
    duration: "1.6s",
    timing: "ease-in-out",
    iteration: "infinite",
  },
  // Progress line animation
  moveHighlight: {
    keyframes: {
      "0%": { left: "-50%" },
      "100%": { left: "100%" },
    },
    duration: "1.5s",
    timing: "linear",
    iteration: "infinite",
  },
  // Bounce dot animation
  bounceDot: {
    keyframes: {
      "0%, 80%, 100%": { transform: "scale(0.7)", opacity: "0.4" },
      "40%": { transform: "scale(1)", opacity: "1" },
    },
    duration: "1.3s",
    timing: "ease-in-out",
    iteration: "infinite",
  },
  // Fade in animation
  fadeIn: {
    keyframes: {
      "0%": { opacity: "0", transform: "translateY(12px)" },
      "100%": { opacity: "1", transform: "translateY(0)" },
    },
    duration: "0.8s",
    timing: "ease-out",
    iteration: "1",
  },
  // Shimmer/skeleton loading animation
  shimmer: {
    keyframes: {
      "0%": { backgroundPosition: "-450px 0" },
      "100%": { backgroundPosition: "450px 0" },
    },
    duration: "1.2s",
    timing: "linear",
    iteration: "infinite",
  },
} as const;

export const typography = {
  fontFamily: {
    sans: [
      "ui-sans-serif",
      "system-ui",
      "sans-serif",
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
      '"Noto Color Emoji"',
    ].join(", "),
  },
  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }], // 12px
    sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
    base: ["1rem", { lineHeight: "1.5rem" }], // 16px
    lg: ["1.125rem", { lineHeight: "1.75rem" }], // 18px
    xl: ["1.25rem", { lineHeight: "1.75rem" }], // 20px
    "2xl": ["1.5rem", { lineHeight: "2rem" }], // 24px
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }], // 30px
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// Z-index scale to prevent z-index conflicts
export const zIndex = {
  modal: 9999,
  overlay: 9998,
  dropdown: 1000,
  header: 100,
  loadingBar: 999999,
} as const;

// Export everything as a single theme object
export const theme = {
  colors,
  spacing,
  borderRadius,
  shadows,
  transitions,
  animations,
  typography,
  breakpoints,
  zIndex,
} as const;

export default theme;
