import { formatRelativeTime, type TaskSummary } from "./taskPresentation";
import { MapleStatusMark } from "./MapleStatusMark";

interface TaskRowProps {
  task: TaskSummary;
  onOpen: (task: TaskSummary) => void;
}

export function TaskRow({ task, onOpen }: TaskRowProps) {
  const attention = task.section === "attention";

  return (
    <article className={`task-row task-row--${task.section}`}>
      <button className="task-row__main" type="button" onClick={() => onOpen(task)}>
        <span className="task-row__mark" aria-hidden="true">
          {attention ? <MapleStatusMark attention /> : <span className="task-row__quiet-mark" />}
        </span>
        <span className="task-row__content">
          <span className="task-row__title">{task.title}</span>
          <span className="task-row__meta">
            <span>{task.projectName}</span>
            <span className="task-row__separator">·</span>
            <span>{task.currentAction}</span>
          </span>
          {task.attentionReason ? (
            <span className="task-row__reason">{task.attentionReason}</span>
          ) : null}
        </span>
        <span className="task-row__status">
          <span className="task-row__status-label">{task.statusLabel}</span>
          <time dateTime={task.updatedAt}>{formatRelativeTime(task.updatedAt)}</time>
        </span>
      </button>
      {task.primaryAction ? (
        <button className="task-row__action" type="button" onClick={() => onOpen(task)}>
          {task.primaryAction.label}
        </button>
      ) : null}
    </article>
  );
}
