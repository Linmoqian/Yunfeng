// Aura 左侧栏：新建会话 + 历史会话 + 工作区文件夹树 + 底部状态卡。
import type { SessionInfo } from "../../lib/types";
import type { FileTreeNode } from "../../hooks/useFileTree";
import type { UseSessionsResult } from "../../hooks/useSessions";
import type { UseSessionResult } from "../../hooks/useSession";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import { Icons } from "../Icons";
import { SessionList } from "./SessionList";
import { FolderTree } from "./FolderTree";
import { StatusCard } from "./StatusCard";

interface SidebarProps {
  sessions: UseSessionsResult;
  session: UseSessionResult;
  fileTree: UseFileTreeResult;
  onPickSession: (s: SessionInfo) => void;
  onNewSession: () => void;
  onOpenFile: (n: FileTreeNode) => void;
  onToast: (msg: string) => void;
}

export function Sidebar({
  sessions,
  session,
  fileTree,
  onPickSession,
  onNewSession,
  onOpenFile,
  onToast,
}: SidebarProps) {
  const hasRoot = Boolean(sessions.projectRoot);

  return (
    <div className="w-64 border-r border-slate-200/60 bg-slate-50/40 flex flex-col justify-between shrink-0">
      <div className="p-3 space-y-4 overflow-y-auto">
        {/* 新建会话 */}
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition active:scale-[0.98]"
        >
          <Icons.Plus className="w-4 h-4" />
          <span>新建会话</span>
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
          hasRoot={hasRoot}
          onToggleDir={fileTree.toggleDir}
          onOpenFile={onOpenFile}
          onPickDirectory={() => sessions.pickDirectory().then((d) => {
            if (d) {
              localStorage.setItem("pi-project-root", d);
              fileTree.setRoot(d);
            }
          })}
          onNewFolder={() => onToast("已创建新工作区文件夹「未命名文件夹」")}
        />
      </div>

      <StatusCard />
    </div>
  );
}
