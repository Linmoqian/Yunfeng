import { Button } from "antd";
import { Plus, Settings } from "lucide-react";

import cloudMascot from "../../../assets/generated/yunfeng-cloud.png";

interface WorkbenchHeaderProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  hasFocus: boolean;
  onNewTask: () => void;
  onOpenSettings: () => void;
}

export function WorkbenchHeader({
  sidebarCollapsed,
  onToggleSidebar,
  hasFocus,
  onNewTask,
  onOpenSettings,
}: WorkbenchHeaderProps) {
  return (
    <header className="workbench-header">
      <div className="session-main__context">
        {sidebarCollapsed ? (
          <button
            className="sidebar-toggle sidebar-toggle--closed"
            type="button"
            onClick={onToggleSidebar}
            aria-label="打开任务列表"
            aria-expanded="false"
            title="打开任务列表"
          >
            <img className="sidebar-toggle__cloud" src={cloudMascot} alt="" />
            <span className="sidebar-toggle__label" aria-hidden="true">唤回任务列表</span>
          </button>
        ) : null}
      </div>
      <div className="workbench-header__actions">
        {hasFocus ? (
          <Button className="workbench-header__new-task" type="primary" icon={<Plus size={15} />} onClick={onNewTask}>
            新对话
          </Button>
        ) : null}
        <button className="text-button" type="button" onClick={onOpenSettings} aria-label="打开设置">
          <Settings size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
