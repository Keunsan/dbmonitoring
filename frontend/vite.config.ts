import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** TO-BE 프론트 개발 서버 — API는 backend(8000), 전환기 Next(3000) 병행 가능 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});