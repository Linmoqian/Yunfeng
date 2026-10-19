// 移动端 sidecar 客户端入口：dev 阶段默认指向本地 mock sidecar，
// 可通过 localStorage 覆盖（yunfeng-sidecar-url）；Tauri 接入后改为 Rust 命令下发。

import { SidecarClient } from "./api";

export const SIDECAR_URL_KEY = "yunfeng-sidecar-url";
export const DEFAULT_SIDECAR_URL = "http://127.0.0.1:1424";

export function resolveSidecarBaseUrl(): string {
  const saved = localStorage.getItem(SIDECAR_URL_KEY);
  return saved || DEFAULT_SIDECAR_URL;
}

export function createSidecarClient(): SidecarClient {
  return new SidecarClient(resolveSidecarBaseUrl(), "dev-token");
}
