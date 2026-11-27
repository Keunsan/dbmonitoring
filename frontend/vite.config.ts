import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendRoot, "..");

/** TO-BE 프론트 — API proxy는 /api → backend /api/v1 */
export default defineConfig({
  build: {
    cssMinify: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": repoRoot,
      react: path.resolve(frontendRoot, "node_modules/react"),
      "react-dom": path.resolve(frontendRoot, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(frontendRoot, "node_modules/react/jsx-runtime"),
      "react/jsx-dev-runtime": path.resolve(
        frontendRoot,
        "node_modules/react/jsx-dev-runtime",
      ),
      "next/link": path.resolve(frontendRoot, "src/shims/next-link.tsx"),
      "next/navigation": path.resolve(frontendRoot, "src/shims/next-navigation.ts"),
    },
    dedupe: ["react", "react-dom", "next-themes"],
  },
  optimizeDeps: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    strictPort: true,
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