/* 会话标签排序、分组与关闭恢复；关闭标签不归档会话。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { closeWorkspaceTabs, EMPTY_TABS, type WorkspaceTab } from "../workspaceTabsState";
export type { WorkspaceTab } from "../workspaceTabsState";
export function useWorkspaceTabs() {
  const [state, setState] = useState(EMPTY_TABS);
  function setActive(id: string) {
    setState((current) => {
      const group = current.items.find((tab) => tab.id === id)?.group;
      return { ...current, active: id, collapsedGroups: current.collapsedGroups.filter((value) => value !== group) };
    });
  }
  function open(tab: WorkspaceTab) {
    setState((current) => {
      const existing = current.items.find((item) => item.id === tab.id);
      return { ...current, items: existing ? current.items : [...current.items, tab], active: tab.id,
        collapsedGroups: current.collapsedGroups.filter((value) => value !== (existing?.group ?? tab.group)) };
    });
  }
  function closeMany(ids: string[]): string {
    const next = closeWorkspaceTabs(state, ids);
    setState((current) => closeWorkspaceTabs(current, ids));
    return next.active;
  }
  function replace(id: string, tab: WorkspaceTab) {
    setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...tab, group: item.group } : item),
      active: current.active === id ? tab.id : current.active }));
  }
  function reorder(id: string, beforeId: string, group = false) {
    setState((current) => {
      const moving = current.items.find((item) => item.id === id);
      const target = current.items.find((item) => item.id === beforeId);
      if (!moving || !target || id === beforeId) return current;
      const items = current.items.filter((item) => item.id !== id);
      const index = items.findIndex((item) => item.id === beforeId);
      const groupName = target.group ?? `分组 ${crypto.randomUUID().slice(0, 4)}`;
      if (group) items[index] = { ...target, group: groupName };
      items.splice(index, 0, { ...moving, group: group ? groupName : target.group });
      return { ...current, items };
    });
  }
  function reopen() {
    const tab = state.closed[state.closed.length - 1];
    if (tab) setState((current) => ({ ...current, items: current.items.some((item) => item.id === tab.id) ? current.items : [...current.items, tab],
      active: tab.id, closed: current.closed.slice(0, -1), collapsedGroups: current.collapsedGroups.filter((group) => group !== tab.group) }));
    return tab;
  }
  return { ...state, setActive, open, closeMany, close: (id: string) => closeMany([id]), replace, reorder, reopen, canReopen: state.closed.length > 0,
    rename: (id: string, title: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, title, renamed: true } : item) })),
    group: (id: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, group: `分组 ${crypto.randomUUID().slice(0, 4)}` } : item) })),
    removeFromGroup: (id: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, group: undefined } : item) })),
    ungroup: (group: string) => setState((current) => ({ ...current, items: current.items.map((item) => item.group === group ? { ...item, group: undefined } : item) })),
    toggleGroup: (group: string) => setState((current) => ({ ...current, collapsedGroups: current.collapsedGroups.includes(group)
      ? current.collapsedGroups.filter((item) => item !== group) : [...current.collapsedGroups, group] })),
  };
}
