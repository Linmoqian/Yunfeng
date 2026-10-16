/* 共享指针 SDK：注册区域定位，权威状态来自 Rust，窗口只渲染快照。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { SharedComponentId } from "./componentSharing";
export interface ComponentFocus { component: SharedComponentId; revision: number; target: string | null }
async function call(component: SharedComponentId, action: "read" | "focus" | "blur", target?: string): Promise<ComponentFocus> {
  if (!isTauri()) throw new Error("共享指针需要 Tauri 原生应用");
  return invoke("component_focus", { request: { component, action, ...(target !== undefined ? { target } : {}) } });
}
export const componentFocus = {
  read: (component: SharedComponentId) => call(component, "read"),
  focus: (component: SharedComponentId, target = "component") => call(component, "focus", target),
  blur: (component: SharedComponentId) => call(component, "blur"),
  subscribe: async (listener: (snapshot: ComponentFocus) => void): Promise<() => void> => {
    if (!isTauri()) throw new Error("共享指针需要 Tauri 原生应用");
    return getCurrentWebviewWindow().listen<ComponentFocus>("component-focus-changed", ({ payload }) => listener(payload));
  },
};

const writingRoots = ['[data-agent-component="writing"]', 'section[aria-label="论文文稿"]', 'section[aria-label="论文写作"]'];
const writingSelector = (suffix = "") => writingRoots.map((root) => `${root}${suffix}`).join(",");
const selectors: Record<SharedComponentId, Record<string, string>> = {
  writing: { component: writingSelector(), name: writingSelector(' input:not([type="file"])'), body: ["编辑视图", "预览视图"].map((label) => writingSelector(` [role="region"][aria-label="${label}"]`)).join(",") },
  resources: { component: '[data-agent-component="resources"]', view: '[data-agent-component="resources"] [data-agent-target="view"]', files: '[data-agent-component="resources"] [data-agent-target="files"]' },
};
export const focusLabels: Record<SharedComponentId, Record<string, string>> = {
  writing: { component: "文稿", name: "文稿标题", body: "文稿正文" },
  resources: { component: "资源", view: "资源分类", files: "资源清单" },
};
/** 仅查找已注册区域；不执行任意选择器，不改变滚动、选区或键盘焦点。 */
export function focusElement(focus: ComponentFocus): HTMLElement | null {
  const selector = focus.target && selectors[focus.component]?.[focus.target];
  if (!selector) return null;
  return [...document.querySelectorAll<HTMLElement>(selector)].find((element) => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
  }) ?? null;
}
