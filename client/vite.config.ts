import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  server: {
    port: 9999,
    proxy: {
      "/api": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8888",
        ws: true,
      },
    },
  },
});
