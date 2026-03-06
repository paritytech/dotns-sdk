import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";

/**
 * Composable for managing a single tooltip instance
 * Handles positioning, visibility, and viewport collision detection
 */
export function useTooltip() {
  const visible = ref(false);
  const buttonRef = ref<HTMLElement | null>(null);
  const tooltipRef = ref<HTMLElement | null>(null);
  const style = ref<Record<string, string>>({});

  function calculatePosition(
    buttonEl: HTMLElement | null,
    tooltipEl: HTMLElement | null,
  ): Record<string, string> {
    if (!buttonEl || !tooltipEl) {
      return { top: "0px", left: "0px", opacity: "0" };
    }

    const buttonRect = buttonEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const gap = 8;
    const padding = 16;

    let top = buttonRect.bottom + gap;
    let left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;

    // Check if tooltip goes below viewport, flip to top
    if (top + tooltipRect.height + padding > viewportHeight) {
      top = buttonRect.top - tooltipRect.height - gap;
    }

    // Check if tooltip goes off left edge
    if (left < padding) {
      left = padding;
    } else if (left + tooltipRect.width + padding > viewportWidth) {
      // Check if tooltip goes off right edge
      left = viewportWidth - tooltipRect.width - padding;
    }

    // Ensure tooltip doesn't go off top edge
    if (top < padding) {
      top = padding;
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      opacity: "1",
    };
  }

  async function show() {
    visible.value = true;
    await nextTick();
    await nextTick();
    style.value = calculatePosition(buttonRef.value, tooltipRef.value);
  }

  function hide() {
    visible.value = false;
    style.value = {};
  }

  function updatePosition() {
    if (visible.value) {
      style.value = calculatePosition(buttonRef.value, tooltipRef.value);
    }
  }

  onMounted(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updatePosition);
    window.removeEventListener("scroll", updatePosition, true);
  });

  return {
    visible,
    buttonRef,
    tooltipRef,
    style,
    show,
    hide,
  };
}
