import { FolderTree, MessageSquare, Settings } from "lucide-react";
import { WindowControls } from "./WindowControls";

export type SidebarView = "sessions" | "files";

interface ActivityBarProps {
  active: SidebarView;
  onChange: (v: SidebarView) => void;
  onOpenSettings: () => void;
}

/** VS Code 风活动栏：顶部窗口控制 + 会话/文件切换 + 底部设置。 */
export function ActivityBar({ active, onChange, onOpenSettings }: ActivityBarProps) {
  return (
    <div className="activity-bar">
      <WindowControls />
      <div className="activity-icons">
        <button
          type="button"
          className={`activity-icon${active === "sessions" ? " is-active" : ""}`}
          title="会话"
          onClick={() => onChange("sessions")}
        >
          <MessageSquare size={20} />
        </button>
        <button
          type="button"
          className={`activity-icon${active === "files" ? " is-active" : ""}`}
          title="工作区"
          onClick={() => onChange("files")}
        >
          <FolderTree size={20} />
        </button>
      </div>
      <div className="activity-spacer" />
      <button type="button" className="activity-icon" title="设置" onClick={onOpenSettings}>
        <Settings size={20} />
      </button>
    </div>
  );
}
