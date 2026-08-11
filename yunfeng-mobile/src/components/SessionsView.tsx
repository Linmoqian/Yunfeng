import { useState } from "react";
import { MessageSquare, Search } from "lucide-react";
import { sessions } from "@/lib/data";

type Props = { onOpenSession: (id: string | null, title: string) => void };

export default function SessionsView({ onOpenSession }: Props) {
  const [q, setQ] = useState("");
  const list = sessions.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="px-5 pb-8 pt-6">
      <h1 className="text-[22px] font-semibold tracking-tight">会话</h1>

      <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索会话"
          className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </label>

      <div className="mt-4 space-y-2">
        {list.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpenSession(s.id, s.title)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-accent">
              <MessageSquare className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{s.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.snippet}</span>
            </span>
            <span className="shrink-0 text-[11px] text-faint">{s.updatedAt}</span>
          </button>
        ))}
        {list.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">没有匹配的会话</p>
        )}
      </div>
    </div>
  );
}
