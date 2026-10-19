/* 共享组件以 DOM 行为验证，宿主副作用由各端负责。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "jsdom", include: ["tests/*.test.tsx"] } });
