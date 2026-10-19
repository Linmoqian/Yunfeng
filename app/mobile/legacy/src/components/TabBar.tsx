import { Home, Kanban, MessageSquare, Settings } from "lucide-react";
import type { Tab } from "@/App";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "home", label: "首页", icon: Home },
  { id: "taskboard", label: "看板", icon: Kanban },
  { id: "sessions", label: "会话", icon: MessageSquare },
  { id: "settings", label: "我的", icon: Settings },
] as const;

export default function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="shrink-0 border-t border-border bg-surface px-4 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl">
      <div className="flex items-center justify-around">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="flex w-16 flex-col items-center gap-1 py-1 transition active:scale-95"
            >
              <Icon className={cn("size-5 transition", active ? "text-accent" : "text-faint")} />
              <span
                className={cn("text-[11px]", active ? "font-medium text-accent" : "text-faint")}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
