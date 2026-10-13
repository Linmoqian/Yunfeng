/* 标签关闭与恢复的原子状态转换，批量关闭只计算一次后继标签。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
export interface WorkspaceTab {
  id: string; title: string; kind: "task" | "session" | "draft" | "utility";
  entityId?: string; group?: string; renamed?: boolean;
}
export interface WorkspaceTabsState {
  items: WorkspaceTab[]; active: string; closed: WorkspaceTab[]; collapsedGroups: string[];
}
export const EMPTY_TABS: WorkspaceTabsState = { items: [], active: "home", closed: [], collapsedGroups: [] };
export function closeWorkspaceTabs(state: WorkspaceTabsState, ids: string[]): WorkspaceTabsState {
  const removed = state.items.filter((tab) => ids.includes(tab.id));
  const items = state.items.filter((tab) => !ids.includes(tab.id));
  const index = state.items.findIndex((tab) => tab.id === state.active);
  const active = ids.includes(state.active) ? items[Math.min(index, items.length - 1)]?.id ?? "home" : state.active;
  const group = items.find((tab) => tab.id === active)?.group;
  return { ...state, items, active, closed: [...state.closed, ...removed].slice(-20),
    collapsedGroups: group ? state.collapsedGroups.filter((value) => value !== group) : state.collapsedGroups };
}
