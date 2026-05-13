import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer/",
    },

    dedupe: [
      "@polkadot-api/descriptors",
      "@polkadot/util",
      "@polkadot/util-crypto",
    ],
  },

  optimizeDeps: {
    include: ["buffer", "@ipld/dag-pb", "ipfs-unixfs"],
    exclude: ["@polkadot-api/descriptors"],
  },

  build: {
    chunkSizeWarningLimit: 1000,
  },

  worker: {
    format: "es",
  },
});
