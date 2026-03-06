# UI Components

Reusable UI primitive components following the design patterns from polkadot-deployment-portal.

## Loader Component

Simple loading spinner component with pre-configured animation.

### Usage

```vue
<template>
  <Loader size="sm" class="text-primary" />
  <Loader size="md" class="text-white" />
</template>

<script setup lang="ts">
import Loader from "@/components/ui/Loader.vue";
</script>
```

### Props

- `size` (optional): 'xs' | 'sm' | 'md' | 'lg' | 'xl' - Size variant (default: 'md')
- `class` (optional): string - Additional CSS classes

### When to Use

- Standalone loading indicators
- Inline loading states
- For button loading states, use `<Button loading />` instead

---

## Modal Component

Reusable modal base component that handles backdrop, transitions, and close functionality.

### Usage

```vue
<template>
  <Modal :open="isOpen" size="md" :show-close="true" @close="handleClose">
    <h2>Modal Title</h2>
    <p>Modal content goes here...</p>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Modal from "@/components/ui/Modal.vue";

const isOpen = ref(false);

function handleClose() {
  isOpen.value = false;
}
</script>
```

### Props

- `open` (required): boolean - Controls modal visibility
- `showClose` (optional): boolean - Show close button in top-right (default: true)
- `closeOnBackdrop` (optional): boolean - Close when clicking backdrop (default: true)
- `size` (optional): 'sm' | 'md' | 'lg' | 'xl' - Modal width (default: 'md')
- `class` (optional): string - Additional CSS classes for modal content
- `closeLabel` (optional): string - Aria label for close button (default: 'Close modal')

### Events

- `@close` - Emitted when modal should close (backdrop click or close button)

### Features

- Automatic backdrop with blur effect
- Smooth enter/exit transitions
- Click outside to close (configurable)
- Built-in close button (optional)
- Keyboard accessible
- Size variants
- Teleports to body element

---

## Icon System

Centralized icon components to eliminate SVG duplication across the codebase.

### Usage

#### Using the Icon Component (Recommended)

```vue
<template>
  <Icon name="Spinner" size="sm" class="animate-spin text-primary" />
  <Icon name="Check" size="md" class="text-green-500" />
  <Icon name="X" size="lg" class="text-red-500" />
</template>

<script setup lang="ts">
import Icon from "@/components/ui/Icon.vue";
</script>
```

#### Using Icons Directly

```vue
<template>
  <Spinner class="w-4 h-4 animate-spin" />
  <Check class="w-5 h-5 text-green-500" />
</template>

<script setup lang="ts">
import { Spinner, Check } from "@/components/ui/icons";
</script>
```

### Available Icons

- `Spinner` - Loading spinner with circle and arc
- `Check` - Checkmark
- `X` - Close/dismiss icon
- `Info` - Information circle
- `Menu` - Hamburger menu (three lines)
- `Search` - Magnifying glass
- `CheckCircle` - Checkmark with circle background
- `AlertTriangle` - Warning triangle
- `ExternalLink` - External link arrow
- `ChevronDown` - Downward chevron
- `ChevronUp` - Upward chevron
- `Copy` - Copy/duplicate icon

### Icon Component Props

- `name` (required): IconName - The name of the icon to render
- `size` (optional): 'xs' | 'sm' | 'md' | 'lg' | 'xl' - Size variant (default: 'md')
- `class` (optional): string - Additional CSS classes

### Size Reference

- `xs`: 12px (w-3 h-3)
- `sm`: 16px (w-4 h-4)
- `md`: 20px (w-5 h-5) - default
- `lg`: 24px (w-6 h-6)
- `xl`: 32px (w-8 h-8)

### Benefits

- **Reduced bundle size**: Single definition vs. repeated SVG code
- **Consistency**: All icons use the same styling approach
- **Type safety**: TypeScript ensures only valid icon names are used
- **Easy to maintain**: Update icons in one place
- **Performance**: Vue can optimize component reuse

### Migration Example

**Before:**

```vue
<svg
  class="animate-spin h-4 w-4 text-white"
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
>
  <circle
    class="opacity-25"
    cx="12"
    cy="12"
    r="10"
    stroke="currentColor"
    stroke-width="4"
  />
  <path
    class="opacity-75"
    fill="currentColor"
    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
  />
</svg>
```

**After:**

```vue
<Icon name="Spinner" size="sm" class="animate-spin text-white" />
```

**Savings**: 17 lines → 1 line (94% reduction)
