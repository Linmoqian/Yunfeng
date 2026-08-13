import { Button } from "antd";
import { Plus, Settings } from "lucide-react";

import cloudMascot from "../../../assets/generated/yunfeng-cloud.png";

import type { ConnectionState } from "../../../store/workbenchSlice";

interface WorkbenchHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  hasFocus: boolean;
  contextTitle: string;
  connectionState: ConnectionState;
  onNewTask: () => void;
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
  contextTitle,
  connectionState,
  onNewTask,
  onOpenSettings,
}: WorkbenchHeaderProps) {
  return (
    <header className="workbench-header">
      <div className="session-main__context">
        <button
          className={`sidebar-toggle sidebar-toggle--${sidebarCollapsed ? "closed" : "open"}`}
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "打开任务列表" : "关闭任务列表"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "打开任务列表" : "关闭任务列表"}
        >
          <img className="sidebar-toggle__cloud" src={cloudMascot} alt="" />
          <span className="sidebar-toggle__label" aria-hidden="true">
            {sidebarCollapsed ? "唤回任务列表" : "带走任务列表"}
          </span>
        </button>
        <div>
          <p className="eyebrow">{hasFocus ? "当前对话" : "Yunfeng"}</p>
          <span>{contextTitle}</span>
        </div>
      </div>
      <div className="workbench-header__actions">
        <span className={`connection-state connection-state--${connectionState}`}>
          <span className="connection-state__dot" aria-hidden="true" />
          <span>{CONNECTION_LABELS[connectionState]}</span>
        </span>
        {hasFocus ? (
          <Button className="workbench-header__new-task" type="primary" icon={<Plus size={15} />} onClick={onNewTask}>
            新对话
          </Button>
        ) : null}
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
