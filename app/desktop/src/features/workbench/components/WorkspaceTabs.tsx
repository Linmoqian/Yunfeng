/* 移植 LianAgent 中央标签的分组、菜单与键盘导航形式。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { App, Dropdown, Input } from "antd";
import { MessageSquare, Plus, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import type { useWorkspaceTabs, WorkspaceTab } from "../hooks/useWorkspaceTabs";
import { SPRING_LAYOUT } from "../workspaceMotion";
import { visibleWorkspaceTabs } from "../workspaceTabsState";
import styles from "./WorkspaceShell.module.css";

export function WorkspaceTabs({ tabs, onActivate, onClose, onNew, onReopen, resolveTitle }: {
  tabs: ReturnType<typeof useWorkspaceTabs>; onActivate: (id: string) => void;
  onClose: (id: string) => void; onNew: () => void; onReopen: () => void; resolveTitle: (tab: WorkspaceTab) => string;
}) {
  const reduced = useReducedMotion();
  const { modal } = App.useApp();
  const root = useRef<HTMLDivElement>(null);
  const menuOrigin = useRef<HTMLButtonElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; target?: string; after?: boolean } | null>(null);
  const shownGroups = new Set<string>();
  const visibleTabs = visibleWorkspaceTabs(tabs.items, tabs.collapsedGroups);
  function rename(tab: WorkspaceTab) {
    let title = resolveTitle(tab);
    modal.confirm({ title: "重命名标签", icon: null, content: <Input defaultValue={title} maxLength={80} aria-label="标签名称" onChange={(event) => { title = event.target.value; }} />,
      okText: "保存", cancelText: "取消", onOk: () => { if (title.trim()) tabs.rename(tab.id, title.trim()); } });
  }
  function renderTab(tab: WorkspaceTab) {
    const title = resolveTitle(tab);
    return <Dropdown key={tab.id} trigger={["contextMenu"]} autoFocus menu={{ onKeyDown: (event) => {
      if (event.key === "Escape") menuOrigin.current?.focus({ preventScroll: true });
    }, items: [
      { key: "rename", label: "重命名标签" }, { key: "close", label: "关闭标签页" },
      { key: "others", label: "关闭其他标签页" }, { key: "group", label: tab.group ? "移出分组" : "新建分组" },
    ], onClick: ({ key }) => {
      if (key === "rename") rename(tab);
      if (key === "close") onClose(tab.id);
      if (key === "others") { tabs.closeMany(tabs.items.filter((item) => item.id !== tab.id).map((item) => item.id)); onActivate(tab.id); }
      if (key === "group") tab.group ? tabs.removeFromGroup(tab.id) : tabs.group(tab.id);
    }}}>
      <motion.div layout={reduced ? false : "position"} transition={SPRING_LAYOUT} className={styles.tab} data-active={tabs.active === tab.id || undefined}
        data-dragging={drag?.id === tab.id || undefined} data-drop={drag?.target === tab.id ? (drag.after ? "after" : "before") : undefined}
        onContextMenu={(event) => { event.stopPropagation(); menuOrigin.current = event.currentTarget.querySelector<HTMLButtonElement>('[role="tab"]'); menuOrigin.current?.focus({ preventScroll: true }); }}
        draggable onDragStartCapture={(event) => { event.dataTransfer.setData("application/yunfeng-tab", tab.id); event.dataTransfer.effectAllowed = "move"; setDrag({ id: tab.id }); }}
        onDragEnd={() => setDrag(null)}
        onDragOver={(event) => {
          const e = event as unknown as React.DragEvent<HTMLDivElement>;
          if (!Array.from(e.dataTransfer.types).includes("application/yunfeng-tab")) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          const after = e.clientX >= rect.left + rect.width / 2;
          setDrag((current) => current && current.id !== tab.id ? { ...current, target: tab.id, after } : current);
        }}
        onDrop={(event) => {
          const e = event as unknown as React.DragEvent<HTMLDivElement>;
          const id = e.dataTransfer.getData("application/yunfeng-tab");
          if (!id) return;
          e.preventDefault(); e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          tabs.reorder(id, tab.id, e.altKey, e.clientX >= rect.left + rect.width / 2);
          setDrag(null);
        }}
        onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); onClose(tab.id); } }}>
        <button className={styles.tabLabel} type="button" role="tab" aria-selected={tabs.active === tab.id} tabIndex={tabs.active === tab.id ? 0 : -1} onClick={() => onActivate(tab.id)}>
          <MessageSquare size={13} aria-hidden /><span>{title}</span>
        </button>
        <button className={styles.iconButton} type="button" aria-label={`关闭“${title}”标签页`} onClick={() => onClose(tab.id)}><X size={14} /></button>
      </motion.div>
    </Dropdown>;
  }
  return <header className={styles.tabsHeader}>
    <Dropdown trigger={["contextMenu"]} menu={{ items: [
      { key: "new", label: "新建标签页" }, { key: "reopen", label: "重新打开关闭的标签页", disabled: !tabs.canReopen },
    ], onClick: ({ key }) => key === "new" ? onNew() : onReopen() }}>
      <div className={styles.tabList} ref={root} role="tablist" aria-label="已打开的标签页"
        onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End", "Delete"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Delete") { onClose(tabs.active); return; }
          const index = visibleTabs.findIndex((item) => item.id === tabs.active);
          const next = event.key === "Home" ? 0 : event.key === "End" ? visibleTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + visibleTabs.length) % visibleTabs.length;
          if (visibleTabs[next]) { onActivate(visibleTabs[next].id); root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus(); }
        }}>
        {tabs.items.map((tab) => {
          if (!tab.group) return renderTab(tab);
          if (shownGroups.has(tab.group)) return null;
          shownGroups.add(tab.group);
          const group = tab.group;
          const collapsed = tabs.collapsedGroups.includes(group);
          return <Dropdown key={group} trigger={["contextMenu"]} menu={{ items: [{ key: "ungroup", label: "取消分组" }], onClick: () => tabs.ungroup(group) }}>
            <div className={styles.tabGroup} onContextMenu={(event) => event.stopPropagation()}>
              <button type="button" className={styles.groupLabel} aria-expanded={!collapsed} onClick={() => tabs.toggleGroup(group)}>{group}</button>
              {!collapsed && tabs.items.filter((item) => item.group === group).map(renderTab)}
            </div>
          </Dropdown>;
        })}
        <button type="button" className={styles.iconButton} onClick={onNew} aria-label="在当前工作区新建会话" title="新建标签页"><Plus size={17} /></button>
      </div>
    </Dropdown>
  </header>;
}
