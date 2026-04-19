import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: "/pages/index.html",
  },
  build: {
    outDir: "dist",
  },
});
