import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight, Cloud, Cpu, MessageSquare, Sparkles } from "lucide-react";
import { quickCommands, type AgentStatus } from "@/lib/data";
import type { AgentStatusInfo } from "@/lib/agentEvents";
import { formatRelativeTime, type MobileSession } from "@/lib/sessionStore";
import { cn } from "@/lib/utils";

type Props = {
  onOpenSession: (id: string | null, title: string) => void;
  recent: MobileSession[];
  agents: AgentStatusInfo[];
};
type RunMode = "local" | "cloud";

export default function HomeView({ onOpenSession, recent, agents }: Props) {
  const [mode, setMode] = useState<RunMode>("local");

  return (
    <div className="relative min-h-full px-5 pb-8 pt-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,var(--accent-soft),transparent)]" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-faint">
              Yunfeng Mobile
            </p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">
              你好，今天想做什么？
            </h1>
          </div>
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>

        <button
          onClick={() => onOpenSession(null, "新对话")}
          className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-[18px]" />
          </span>
          <span className="flex-1 truncate text-[15px] text-muted-foreground">输入指令或提问…</span>
          <ChevronRight className="size-4 text-faint" />
        </button>

        <SectionTitle>快捷指令</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {quickCommands.map((q) => (
            <button
              key={q.id}
              onClick={() => onOpenSession(null, q.title)}
              className="rounded-2xl border border-border bg-surface p-4 text-left transition hover:bg-muted active:scale-[0.98]"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-muted text-accent">
                <q.icon className="size-[18px]" />
              </span>
              <p className="mt-3 text-[15px] font-medium">{q.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{q.subtitle}</p>
            </button>
          ))}
        </div>

        <SectionTitle>Agent 协作中</SectionTitle>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {agents.map((a, i) => (
            <div
              key={a.id}
              className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border")}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", a.accent)}>
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.status === "working" ? a.activity : a.role}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>

        <SectionTitle>最近会话</SectionTitle>
        <div className="space-y-2">
          {recent.slice(0, 2).map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSession(s.id, s.title)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left transition active:scale-[0.99]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <MessageSquare className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.snippet}</span>
              </span>
              <span className="shrink-0 text-[11px] text-faint">{formatRelativeTime(s.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-7 text-[13px] font-medium text-muted-foreground">{children}</h2>;
}

function ModeSwitch({ mode, onChange }: { mode: RunMode; onChange: (m: RunMode) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-full border border-border bg-surface p-0.5">
      <ModeButton
        active={mode === "local"}
        onClick={() => onChange("local")}
        icon={<Cpu className="size-3.5" />}
        label="本地"
      />
      <ModeButton
        active={mode === "cloud"}
        onClick={() => onChange("cloud")}
        icon={<Cloud className="size-3.5" />}
        label="效率"
      />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition",
        active
          ? "bg-accent font-medium text-accent-foreground shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
          : "text-muted-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  const map = {
    working: { label: "工作中", dot: "bg-amber-400 animate-pulse", text: "text-amber-600 dark:text-amber-400" },
    online: { label: "在线", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
    idle: { label: "空闲", dot: "bg-zinc-400", text: "text-zinc-500 dark:text-zinc-400" },
  } as const;
  const s = map[status];
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 text-[11px]", s.text)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
