import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/// <reference types="vitest/config" />

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// /api 代理目标：默认本地 mock sidecar，可用 YF_API_PROXY 覆盖（与主应用一致）
// @ts-expect-error process is a nodejs global
const apiProxyTarget = process.env.YF_API_PROXY ?? "http://127.0.0.1:1424";

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1422,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1423,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // 开发环境下将 /api 代理到后端（默认 mock sidecar）
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
}));
