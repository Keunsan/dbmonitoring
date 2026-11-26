import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** TO-BE 프론트 — API proxy는 /api → backend /api/v1 */
export default defineConfig({
  build: {
    cssMinify: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": repoRoot,
      "next/link": path.resolve(repoRoot, "frontend/src/shims/next-link.tsx"),
      "next/navigation": path.resolve(repoRoot, "frontend/src/shims/next-navigation.ts"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (requestPath) =>
          requestPath.startsWith("/api/v1")
            ? requestPath
            : requestPath.replace(/^\/api/, "/api/v1"),
      },
    },
  },
});