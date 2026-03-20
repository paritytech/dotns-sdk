import type { Component } from "vue";

type DynamicImportFactory = () => Promise<{ default: Component }>;

export function isChunkLoadError(error: Error): boolean {
  const msg = error.message;
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    msg.includes("Unable to preload CSS")
  );
}

export function lazyLoad(factory: DynamicImportFactory) {
  return async () => {
    try {
      return await factory();
    } catch (error) {
      if (error instanceof Error && isChunkLoadError(error)) {
        await new Promise<void>((r) => setTimeout(r, 1000));
        return factory();
      }
      throw error;
    }
  };
}
