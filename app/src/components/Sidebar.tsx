import type { SessionInfo } from "../lib/types";

interface SidebarProps {
  sessions: SessionInfo[];
  loading: boolean;
  activeSessionId: string | null;
  projectRoot: string | null;
  onSelect: (s: SessionInfo) => void;
  onNewSession: () => void;
  onPickDirectory: () => Promise<void>;
  onClearProject: () => void;
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function Sidebar({
  sessions,
  loading,
  activeSessionId,
  projectRoot,
  onSelect,
  onNewSession,
  onPickDirectory,
  onClearProject,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-title">项目</div>
        <div className="project-controls">
          {projectRoot ? (
            <>
              <div className="project-path" title={projectRoot}>
                📁 {projectRoot.split(/[\\/]/).pop()}
              </div>
              <button className="btn btn-small" onClick={() => void onPickDirectory()}>
                切换
              </button>
              <button className="btn btn-small" onClick={onClearProject}>
                清除
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-block" onClick={() => void onPickDirectory()}>
              选择项目目录
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-section sidebar-sessions">
        <div className="sidebar-title">
          会话
          <button className="btn btn-small" onClick={onNewSession} disabled={!projectRoot}>
            新建
          </button>
        </div>
        <div className="session-list">
          {loading && <div className="sidebar-hint">加载中…</div>}
          {!loading && sessions.length === 0 && <div className="sidebar-hint">暂无会话</div>}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`session-item ${activeSessionId === s.id ? "session-item-active" : ""}`}
              onClick={() => onSelect(s)}
              title={s.path}
            >
              <div className="session-item-name">
                {s.name || s.firstMessage || "(无消息)"}
              </div>
              <div className="session-item-meta">
                {s.cwd ? s.cwd.split(/[\\/]/).filter(Boolean).pop() : "?"} · {s.messageCount} 条消息 ·{" "}
                {formatTime(s.modified)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
