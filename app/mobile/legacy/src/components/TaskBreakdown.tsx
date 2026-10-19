import { useState } from "react";
import { CheckCircle2, ChevronDown, Circle, ListChecks, Loader2, XCircle } from "lucide-react";
import type { TaskItem } from "@/lib/chatEvents";
import { cn } from "@/lib/utils";

/** 任务拆解视图：主管拆解后的子任务进度列表（Marvis 任务进度呈现）。 */
export function TaskBreakdown({ tasks }: { tasks: TaskItem[] }) {
  const [open, setOpen] = useState(true);
  const done = tasks.filter((t) => t.status === "done").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  return (
    <div className="msg-in rounded-xl border border-border bg-surface px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <ListChecks className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-medium">任务拆解</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {done}/{tasks.length}
          {failed > 0 && <span className="ml-1 text-red-500">· {failed} 失败</span>}
        </span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && tasks.length > 0 && (
        <div className="mt-2.5">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[13px]">
                <TaskStatusIcon status={t.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    t.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/50",
                    t.status === "failed" && "text-red-500",
                  )}
                >
                  {t.title}
                  {t.status === "running" && t.detail && (
                    <span className="ml-1 text-xs text-muted-foreground">{t.detail}</span>
                  )}
                  {t.status === "failed" && t.detail && (
                    <span className="ml-1 text-xs">{t.detail}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TaskStatusIcon({ status }: { status: TaskItem["status"] }) {
  if (status === "done") return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />;
  if (status === "running")
    return <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-accent" />;
  if (status === "failed") return <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" />;
  return <Circle className="mt-0.5 size-3.5 shrink-0 text-faint" />;
}
