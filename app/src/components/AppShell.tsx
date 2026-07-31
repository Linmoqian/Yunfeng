import type { ReactNode } from "react";
import { ActivityBar, type SidebarView } from "./ActivityBar";

interface AppShellProps {
  activeView: SidebarView;
  onActiveViewChange: (v: SidebarView) => void;
  onOpenSettings: () => void;
  sidebar: ReactNode;
  children: ReactNode;
}

/** 应用骨架：活动栏 + 侧栏槽 + 主区槽。 */
export function AppShell({
  activeView,
  onActiveViewChange,
  onOpenSettings,
  sidebar,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <ActivityBar
        active={activeView}
        onChange={onActiveViewChange}
        onOpenSettings={onOpenSettings}
      />
      <aside className="sidebar">{sidebar}</aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
