import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 默认代理到 8000；可通过 YF_API_PROXY 覆盖（例如本地起独立后端验证 E2E）。
const apiProxyTarget = process.env.YF_API_PROXY ?? "http://127.0.0.1:8000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发环境下将 /api 代理到 Node 后端（server/）
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
