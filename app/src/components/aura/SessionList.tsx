// Aura 历史会话列表：名称 + 时间标签，当前会话高亮，hover 显示更多操作。
import type { SessionInfo } from "../../lib/types";
import { Icons } from "../Icons";

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
    <div className="space-y-1">
      <div className="px-2 py-1 flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <span className="flex items-center space-x-1.5 font-pixel">
          <Icons.MessageSquare className="w-3.5 h-3.5" />
          <span>历史会话</span>
        </span>
        <span className="text-xs bg-slate-200/60 text-slate-500 px-1.5 py-0.5 rounded-md font-pixel">
          {sessions.length}
        </span>
      </div>

      <div className="space-y-0.5">
        {loading && <div className="px-3 py-2 text-xs text-slate-500">加载中…</div>}
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-500">暂无会话</div>
        )}
        {sessions.map((s) => {
          const active = activeId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition text-left group pixel-press ${
                active
                  ? "bg-indigo-100/50 border-2 border-indigo-400/60 text-indigo-500 font-medium shadow-md"
                  : "hover:bg-slate-200/40 text-slate-600"
              }`}
              title={s.path}
            >
              <div className="flex items-center space-x-2 truncate">
                {active ? (
                  <Icons.MessageCircleMore className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                ) : (
                  <Icons.MessageCircle className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                )}
                <span className="truncate">{s.name || s.firstMessage || "(无消息)"}</span>
              </div>
              <span className="text-[11px] shrink-0 group-hover:hidden font-pixel text-slate-500">
                {formatDay(s.modified)}
              </span>
              <Icons.MoreHorizontal className="w-3.5 h-3.5 text-slate-500 hidden group-hover:inline-block shrink-0 hover:text-slate-600" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
