import { MessageCircle, MessageCircleMore } from "lucide-react";
import type { SessionInfo } from "@/lib/types";

interface SessionListProps {
  sessions: SessionInfo[];
  loading: boolean;
  activeId: string | null;
  onPick: (s: SessionInfo) => void;
}

/** 相对时间：今天 / 昨天 / M月D日 */
function formatDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function SessionList({ sessions, loading, activeId, onPick }: SessionListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading">
        <span>历史会话</span>
      </div>
      {loading && <div className="empty-hint">加载中…</div>}
      {!loading && sessions.length === 0 && <div className="empty-hint">暂无会话</div>}
      {sessions.map((s) => {
        const active = activeId === s.id;
        return (
          <button
            key={s.id}
            className={`session-item${active ? " is-active" : ""}`}
            onClick={() => onPick(s)}
            title={s.path}
          >
            {active ? <MessageCircleMore size={15} /> : <MessageCircle size={15} />}
            <span>{s.name || s.firstMessage || "(无消息)"}</span>
            <small>{formatDay(s.modified)}</small>
          </button>
        );
      })}
    </div>
  );
}
