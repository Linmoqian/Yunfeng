import { Plus, Settings } from "lucide-react";
import type { SessionInfo } from "@/lib/types";
import type { FileTreeNode, UseFileTreeResult } from "@/hooks/useFileTree";
import type { UseSessionsResult } from "@/hooks/useSessions";
import type { UseSessionResult } from "@/hooks/useSession";
import { SessionList } from "./SessionList";
import { FolderTree } from "./FolderTree";

interface SidebarProps {
  sessions: UseSessionsResult;
  session: UseSessionResult;
  fileTree: UseFileTreeResult;
  onPickSession: (s: SessionInfo) => void;
  onNewSession: () => void;
  onOpenFile: (n: FileTreeNode) => void;
  onPickDirectory: () => void;
  onOpenSettings: () => void;
}

/** 侧栏：新建会话 + 会话列表 + 工作区文件树 + 底部目录与设置。 */
export function Sidebar({
  sessions,
  session,
  fileTree,
  onPickSession,
  onNewSession,
  onOpenFile,
  onPickDirectory,
  onOpenSettings,
}: SidebarProps) {
  const rootLabel = sessions.projectRoot
    ? sessions.projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? sessions.projectRoot
    : "未选择目录";

  return (
    <>
      <div className="sidebar-scroll">
        <button type="button" className="primary-action" onClick={onNewSession}>
          <Plus size={15} />
          新建会话
        </button>
        <SessionList
          sessions={sessions.sessions}
          loading={sessions.loading}
          activeId={session.session?.id ?? null}
          onPick={onPickSession}
        />
        <FolderTree
          tree={fileTree.tree}
          loading={fileTree.loading}
          hasRoot={Boolean(sessions.projectRoot)}
          onToggleDir={fileTree.toggleDir}
          onOpenFile={onOpenFile}
          onPickDirectory={onPickDirectory}
        />
      </div>
      <div className="sidebar-footer">
        <span title={sessions.projectRoot ?? ""}>{rootLabel}</span>
        <button type="button" className="icon-button" title="设置" onClick={onOpenSettings}>
          <Settings size={16} />
        </button>
      </div>
    </>
  );
}
