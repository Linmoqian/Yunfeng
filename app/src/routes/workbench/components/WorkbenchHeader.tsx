import { PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

import type { ConnectionState } from "../../../store/workbenchSlice";

interface WorkbenchHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  hasFocus: boolean;
  connectionState: ConnectionState;
  onOpenSettings: () => void;
}

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connecting: "正在连接",
  connected: "已同步",
  offline: "状态可能已过期",
};

export function WorkbenchHeader({
  sidebarCollapsed,
  onToggleSidebar,
  hasFocus,
  connectionState,
  onOpenSettings,
}: WorkbenchHeaderProps) {
  return (
    <header className="workbench-header">
      <div className="session-main__context">
        <button
          className="icon-button sidebar-toggle"
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "显示会话侧栏" : "隐藏会话侧栏"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "显示会话侧栏" : "隐藏会话侧栏"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} aria-hidden="true" />
          )}
        </button>
        <div>
          <p className="eyebrow">Yunfeng 工作台</p>
          <span>{hasFocus ? "当前任务" : "全部任务"}</span>
        </div>
      </div>
      <div className="workbench-header__actions">
        <span className={`connection-state connection-state--${connectionState}`}>
          <span className="connection-state__dot" aria-hidden="true" />
          <span>{CONNECTION_LABELS[connectionState]}</span>
        </span>
        <button className="text-button" type="button" onClick={onOpenSettings} aria-label="打开设置">
          <span className="workbench-header__settings">
            <Settings size={15} aria-hidden="true" />
            设置
          </span>
        </button>
      </div>
    </header>
  );
}
