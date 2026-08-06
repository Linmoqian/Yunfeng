import { useEffect, useRef, useState } from "react";
import { formatRelativeTime, type TaskSummary } from "./taskPresentation";
import { MapleStatusMark } from "./MapleStatusMark";

interface TaskRowProps {
  task: TaskSummary;
  active?: boolean;
  onOpen: (task: TaskSummary) => void;
  onRename: (taskId: string, name: string) => Promise<void>;
  onArchive: (taskId: string) => Promise<void>;
  onReopen: (taskId: string) => Promise<void>;
}

export function TaskRow({ task, active = false, onOpen, onRename, onArchive, onReopen }: TaskRowProps) {
  const attention = task.section === "attention";
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  async function submitRename() {
    const name = nameDraft.trim();
    if (!name || name === task.title) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(task.id, name);
    } finally {
      setBusy(false);
      setRenaming(false);
    }
  }

  return (
    <article className={`task-row task-row--${task.section} ${active ? "task-row--active" : ""}`.trim()}>
      <button
        className="task-row__main"
        type="button"
        onClick={() => onOpen(task)}
        aria-label={`打开任务：${task.title}`}
      >
        <span className="task-row__mark" aria-hidden="true">
          {attention ? <MapleStatusMark attention /> : <span className="task-row__quiet-mark" />}
        </span>
        <span className="task-row__content">
          {renaming ? (
            <input
              ref={inputRef}
              className="task-row__rename-input"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); void submitRename(); }
                if (event.key === "Escape") { event.preventDefault(); setRenaming(false); }
              }}
              onBlur={() => void submitRename()}
              aria-label="任务新名称"
            />
          ) : (
            <span className="task-row__title">{task.title}</span>
          )}
          <span className="task-row__meta">
            <span>{task.projectName}</span>
            <span className="task-row__separator">·</span>
            <span>{task.statusLabel}</span>
            <span className="task-row__separator">·</span>
            <time dateTime={task.updatedAt}>{formatRelativeTime(task.updatedAt)}</time>
          </span>
          {attention && task.attentionReason ? (
            <span className="task-row__reason">{task.attentionReason}</span>
          ) : null}
        </span>
      </button>

      <div className="task-row__actions">
        {task.section === "archived" && !task.isLegacy ? (
          <button
            className="task-row__action"
            type="button"
            disabled={busy}
            onClick={(event) => { event.stopPropagation(); void onReopen(task.id); }}
          >
            恢复
          </button>
        ) : null}
        {!task.isLegacy && task.section !== "archived" ? (
          <button
            className="task-row__action task-row__action--archive"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              if (window.confirm(`归档任务“${task.title}”？归档后仍可恢复。`)) void onArchive(task.id);
            }}
          >
            归档
          </button>
        ) : null}
        {!task.isLegacy ? (
          <button
            className="task-row__action task-row__action--rename"
            type="button"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              setNameDraft(task.title);
              setRenaming(true);
            }}
          >
            重命名
          </button>
        ) : null}
      </div>
    </article>
  );
}
