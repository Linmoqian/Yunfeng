import type { ReactNode } from "react";
import { Bot } from "lucide-react";
import { WindowControls } from "./WindowControls";

interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
}

/** 应用骨架：侧栏槽 + 主区槽。窗口控制与品牌区在侧栏顶部，可拖窗。 */
export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <WindowControls />
        <div className="brand-mark" data-tauri-drag-region>
          <span>
            <Bot size={18} strokeWidth={2.3} />
          </span>
          <strong>Pi Desktop</strong>
        </div>
        {sidebar}
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
