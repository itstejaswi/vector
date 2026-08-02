import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const SHARED = resolve(__dirname, "../shared/src");

// GitHub Pages serves project sites from /<repo>/, so the base path has to
// match. Set BASE_PATH in CI; local dev and user/org pages use "/".
const BASE = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  resolve: {
    alias: { "@shared": SHARED },
  },
  server: {
    host: true,
    fs: { allow: [resolve(__dirname, ".."), SHARED] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // MapLibre is large and stable; splitting it keeps the app chunk small
    // and lets browsers cache it across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
