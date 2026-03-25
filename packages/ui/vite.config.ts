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
      "polkadot-api",
      "@polkadot-api/descriptors",
      "@polkadot-api/substrate-bindings",
      "@polkadot-api/metadata-builders",
      "@polkadot-api/polkadot-sdk-compat",
      "@polkadot-api/signer",
      "@polkadot-api/pjs-signer",

      "@polkadot/api",
      "@polkadot/types",
      "@polkadot/util",
      "@polkadot/util-crypto",
      "@polkadot/extension-dapp",
      "@polkadot/extension-inject",
    ],
  },

  optimizeDeps: {
    include: ["buffer", "@ipld/dag-pb", "ipfs-unixfs"],
    exclude: [
      "polkadot-api",
      "@polkadot-api/descriptors",
      "@polkadot-api/substrate-bindings",
      "@polkadot-api/metadata-builders",
      "@polkadot-api/polkadot-sdk-compat",
      "@polkadot-api/signer",
      "@polkadot-api/pjs-signer",
    ],
  },

  build: {
    chunkSizeWarningLimit: 1000,
  },

  worker: {
    format: "es",
  },
});
