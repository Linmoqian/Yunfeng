import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, RotateCcw, X } from "lucide-react";
import type { TaskState } from "@/lib/types";
import { Button } from "./ui/button";

interface TaskActionSheetProps {
  task: TaskState;
  open: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onReopen: () => Promise<void>;
  onRetry?: () => Promise<void>;
}

/** 任务操作单：重命名、归档/重开、失败重试。移动端底部弹层，桌面端同样适用。 */
export function TaskActionSheet({
  task,
  open,
  onClose,
  onRename,
  onArchive,
  onReopen,
  onRetry,
}: TaskActionSheetProps) {
  const [name, setName] = useState(task.title);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="action-sheet-backdrop" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="action-sheet-header">
          <strong>任务操作</strong>
          <button type="button" className="icon-button" title="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <label className="field-label" htmlFor="task-rename-input">
          任务名称
          <input
            id="task-rename-input"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="action-sheet-grid">
          <Button
            size="sm"
            disabled={busy || name.trim() === "" || name.trim() === task.title}
            onClick={() => void run(() => onRename(name.trim()))}
          >
            <Pencil size={14} />
            重命名
          </Button>
          {task.status === "failed" && onRetry && (
            <Button size="sm" disabled={busy} onClick={() => void run(onRetry)}>
              <RotateCcw size={14} />
              重试
            </Button>
          )}
          {task.status === "archived" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(onReopen)}>
              <ArchiveRestore size={14} />
              重新打开
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(onArchive)}>
              <Archive size={14} />
              归档
            </Button>
          )}
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          <Check size={14} />
          完成
        </Button>
      </div>
    </div>
  );
}
