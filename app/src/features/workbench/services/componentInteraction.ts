/* 交互反馈 SDK 与呈现确认；仅记录版本，不保存文稿或输入内容。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SharedComponentId } from "./componentSharing";
export interface ComponentInteraction {
  component: SharedComponentId; version: number; known: boolean; visible: boolean; rendered: boolean;
  renderedRevision: number | null; editing: boolean; yielded: boolean;
}
export interface InteractionReport { sequence: number; visible: boolean; renderedRevision: number | null; editing: boolean }
const presentations = new Map<symbol, { component: SharedComponentId; revision: number | null; pending: boolean }>();
export function setPresentation(instance: symbol, value?: { component: SharedComponentId; revision: number | null; pending: boolean }) {
  if (value) presentations.set(instance, value); else presentations.delete(instance);
  window.dispatchEvent(new Event("component-presentation"));
}
export function presentation(component: SharedComponentId) {
  const views = [...presentations.values()].filter((view) => view.component === component);
  return { pending: views.some((view) => view.pending), revision: views.some((view) => view.pending) ? null : views.reduce<number | null>((max, view) => view.revision === null ? max : Math.max(max ?? -1, view.revision), null) };
}
function native(component: SharedComponentId, report?: InteractionReport) {
  if (!isTauri()) return Promise.reject(new Error("交互反馈需要 Tauri 原生应用"));
  return invoke<ComponentInteraction>("component_interaction", { request: { component, ...(report ? { report } : {}) } });
}
export const componentInteraction = {
  read: (component: SharedComponentId) => native(component),
  report: (component: SharedComponentId, report: InteractionReport) => native(component, report),
  subscribe: (listener: (status: ComponentInteraction) => void) => getCurrentWebviewWindow().listen<ComponentInteraction>("component-interaction-changed", ({ payload }) => listener(payload)),
};
