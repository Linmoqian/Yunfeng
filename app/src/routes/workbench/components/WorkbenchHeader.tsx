import { Button } from "antd";
import { Columns3, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();

  return (
    <header className="workbench-header">
      <div className="session-main__context">
        <button
          className="icon-button sidebar-toggle"
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "打开任务列表" : "关闭任务列表"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "打开任务列表" : "关闭任务列表"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={18} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={18} aria-hidden="true" />
          )}
        </button>
        <div>
          <p className="eyebrow">{hasFocus ? "当前对话" : "Yunfeng"}</p>
          <span>{contextTitle}</span>
        </div>
      </div>
      <div className="workbench-header__actions">
        <Button icon={<Columns3 size={15} />} onClick={() => navigate("/taskboard")}>
          任务看板
        </Button>
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
