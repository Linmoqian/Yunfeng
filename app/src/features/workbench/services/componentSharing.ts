/* 组件共享 SDK：其他模块通过此入口读写状态和打开独立窗口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { componentInteraction } from "./componentInteraction";
import { componentFocus } from "./componentFocus";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { recoverSubscription } from "../../../services/recovery";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ResearchState } from "../research-tools/model";

export interface ComponentStates {
  writing: ResearchState;
  resources: { view: string; files: { name: string; size: number }[] };
}
export type SharedComponentId = keyof ComponentStates;
export interface ComponentSnapshot<K extends SharedComponentId = SharedComponentId> {
  component: K; revision: number; state: ComponentStates[K];
}
export const componentDefaults: ComponentStates = {
  writing: { name: "", body: "" }, resources: { view: "文件", files: [] },
};
export function isSharedComponent(value: string): value is SharedComponentId {
  return value === "writing" || value === "resources";
}
function native<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) return Promise.reject(new Error("组件共享需要 Tauri 原生应用"));
  return invoke<T>(command, args);
}

/** 读取 Rust 权威快照；文稿从 SQLite 恢复，资源清单属于本次运行。 */
export function readComponent<K extends SharedComponentId>(component: K): Promise<ComponentSnapshot<K>> {
  return native("component_read", { component });
}
/** 原子合并顶层字段；同字段以 Rust 接收顺序为准。错误不修改状态。 */
export function patchComponent<K extends SharedComponentId>(component: K, patch: Partial<ComponentStates[K]>): Promise<ComponentSnapshot<K>> {
  return native("component_patch", { component, patch });
}
/** 主窗口调用；重复打开聚焦原窗口，关闭保留状态。 */
export function openComponentWindow(component: SharedComponentId): Promise<void> {
  return native("component_window", { component, open: true });
}
export function closeComponentWindow(component: SharedComponentId): Promise<void> {
  return native("component_window", { component, open: false });
}
/** 后台恢复当前 WebView 的通知注册，立即返回清理函数；需补读快照并按 revision 去重。 */
export async function subscribeComponent<K extends SharedComponentId>(component: K, listener: (snapshot: ComponentSnapshot<K>) => void): Promise<() => void> {
  if (!isTauri()) throw new Error("组件共享需要 Tauri 原生应用");
  return recoverSubscription(() => getCurrentWebviewWindow().listen<ComponentSnapshot<K>>("component-state-changed", ({ payload }) => {
    if (payload.component === component) listener(payload);
  }));
}

export const componentSharing = { read: readComponent, patch: patchComponent, open: openComponentWindow, close: closeComponentWindow, focus: componentFocus.focus, blur: componentFocus.blur, readFocus: componentFocus.read, status: componentInteraction.read, subscribe: subscribeComponent };
export function sharingError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "code" in error && "message" in error
    && ["UNKNOWN_COMPONENT", "FORBIDDEN", "INVALID_STATE", "STATE_ERROR", "WINDOW_ERROR", "STORAGE_ERROR", "STORAGE_VERSION"].includes(String(error.code))) return String(error.message);
  return "组件同步失败，请重试";
}
