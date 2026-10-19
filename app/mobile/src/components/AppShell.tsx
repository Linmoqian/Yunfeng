import type { ReactNode } from "react";
import { ActivityBar, type SidebarView } from "./ActivityBar";

interface AppShellProps {
  activeView: SidebarView;
  onActiveViewChange: (v: SidebarView) => void;
  onOpenSettings: () => void;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}

/** 应用骨架：活动栏 + 侧栏槽 + 主区槽。 */
export function AppShell({
  activeView,
  onActiveViewChange,
  onOpenSettings,
  sidebarOpen,
  onSidebarClose,
  sidebar,
  children,
}: AppShellProps) {
  return (
    <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      <ActivityBar
        active={activeView}
        onChange={onActiveViewChange}
        onOpenSettings={onOpenSettings}
      />
      <aside className="sidebar">{sidebar}</aside>
      {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="关闭任务列表" onClick={onSidebarClose} />}
      <main className="main-content">{children}</main>
    </div>
  );
}
