import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Wrench } from "lucide-react";
import type { ToolCall } from "@/lib/chatEvents";
import { cn } from "@/lib/utils";

/** 工具调用生命周期卡片：running / done / failed，点击展开详情。 */
export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const detail =
    tool.status === "failed" ? tool.error : tool.result ?? tool.message;

  return (
    <div className="msg-in rounded-xl border border-border bg-surface px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Wrench className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tool.name}</span>
        <StatusBadge tool={tool} />
        {detail && (
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-180")}
          />
        )}
      </button>
      {open && detail && (
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ tool }: { tool: ToolCall }) {
  if (tool.status === "running") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-accent">
        <Loader2 className="size-3 animate-spin" />
        运行中
      </span>
    );
  }
  if (tool.status === "failed") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] text-red-500">
        <AlertCircle className="size-3" />
        失败
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-600">
      <CheckCircle2 className="size-3" />
      完成
    </span>
  );
}
