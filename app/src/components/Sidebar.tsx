import { FolderPlus, Plus } from "lucide-react";
import type { SessionInfo } from "@/lib/types";
import type { FileTreeNode, UseFileTreeResult } from "@/hooks/useFileTree";
import type { UseSessionsResult } from "@/hooks/useSessions";
import type { UseSessionResult } from "@/hooks/useSession";
import type { SidebarView } from "./ActivityBar";
import { SessionList } from "./SessionList";
import { FolderTree } from "./FolderTree";

interface SidebarProps {
  activeView: SidebarView;
  sessions: UseSessionsResult;
  session: UseSessionResult;
  fileTree: UseFileTreeResult;
  onPickSession: (s: SessionInfo) => void;
  onNewSession: () => void;
  onOpenFile: (n: FileTreeNode) => void;
  onPickDirectory: () => void;
}

/** 侧栏：品牌头 + 按活动栏选中切换 会话面板 / 文件面板。 */
export function Sidebar({
  activeView,
  sessions,
  session,
  fileTree,
  onPickSession,
  onNewSession,
  onOpenFile,
  onPickDirectory,
}: SidebarProps) {
  return (
    <div className="sidebar-pane">
      <div className="sidebar-header" data-tauri-drag-region>
        <strong>Yunfeng</strong>
        {activeView === "sessions" ? (
          <button type="button" className="icon-button" title="新建会话" onClick={onNewSession}>
            <Plus size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-button"
            title="选择项目目录"
            onClick={onPickDirectory}
          >
            <FolderPlus size={16} />
          </button>
        )}
      </div>
      <div className="sidebar-scroll">
        {activeView === "sessions" ? (
          <SessionList
            sessions={sessions.sessions}
            loading={sessions.loading}
            activeId={session.session?.id ?? null}
            onPick={onPickSession}
          />
        ) : (
          <FolderTree
            tree={fileTree.tree}
            loading={fileTree.loading}
            hasRoot={Boolean(sessions.projectRoot)}
            onToggleDir={fileTree.toggleDir}
            onOpenFile={onOpenFile}
            onPickDirectory={onPickDirectory}
          />
        )}
      </div>
    </div>
  );
}
