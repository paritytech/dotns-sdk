import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";

/**
 * Composable for managing multiple tooltip instances (e.g., in a list)
 * Each tooltip is identified by a unique string ID
 */
export function useTooltipManager() {
  const activeId = ref<string | null>(null);
  const buttonRefs = ref<Map<string, HTMLElement>>(new Map());
  const tooltipRefs = ref<Map<string, HTMLElement>>(new Map());
  const styles = ref<Record<string, Record<string, string>>>({});

  function setButtonRef(id: string, el: any) {
    if (el) {
      buttonRefs.value.set(id, el as HTMLElement);
    }
  }

  function setTooltipRef(id: string, el: any) {
    if (el) {
      tooltipRefs.value.set(id, el as HTMLElement);
    }
  }

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

  async function show(id: string) {
    activeId.value = id;
    await nextTick();
    await nextTick();

    const buttonEl = buttonRefs.value.get(id);
    const tooltipEl = tooltipRefs.value.get(id);

    styles.value[id] = calculatePosition(buttonEl || null, tooltipEl || null);
  }

  function hide(id: string) {
    if (activeId.value === id) {
      activeId.value = null;
      delete styles.value[id];
    }
  }

  function updateAll() {
    if (activeId.value) {
      const id = activeId.value;
      const buttonEl = buttonRefs.value.get(id);
      const tooltipEl = tooltipRefs.value.get(id);
      styles.value[id] = calculatePosition(buttonEl || null, tooltipEl || null);
    }
  }

  onMounted(() => {
    window.addEventListener("resize", updateAll);
    window.addEventListener("scroll", updateAll, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateAll);
    window.removeEventListener("scroll", updateAll, true);
  });

  return {
    activeId,
    setButtonRef,
    setTooltipRef,
    styles,
    show,
    hide,
  };
}
