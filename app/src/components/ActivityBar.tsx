import { MessageSquare, Settings } from "lucide-react";
import { WindowControls } from "./WindowControls";

export type SidebarView = "tasks";

interface ActivityBarProps {
  active: SidebarView;
  onChange: (v: SidebarView) => void;
  onOpenSettings: () => void;
}

/** 活动栏：窗口控制 + 任务 + 设置。文件树入口已随 sidecar 桥接移除。 */
export function ActivityBar({ active, onChange, onOpenSettings }: ActivityBarProps) {
  return (
    <div className="activity-bar">
      <WindowControls />
      <div className="activity-icons">
        <button
          type="button"
          className={`activity-icon${active === "tasks" ? " is-active" : ""}`}
          title="任务"
          onClick={() => onChange("tasks")}
        >
          <MessageSquare size={20} />
        </button>
      </div>
      <div className="activity-spacer" />
      <button type="button" className="activity-icon" title="设置" onClick={onOpenSettings}>
        <Settings size={20} />
      </button>
    </div>
  );
}
