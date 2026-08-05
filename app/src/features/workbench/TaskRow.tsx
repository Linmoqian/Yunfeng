import { formatRelativeTime, type TaskSummary } from "./taskPresentation";
import { MapleStatusMark } from "./MapleStatusMark";

interface TaskRowProps {
  task: TaskSummary;
  active?: boolean;
  onOpen: (task: TaskSummary) => void;
}

export function TaskRow({ task, active = false, onOpen }: TaskRowProps) {
  const attention = task.section === "attention";

  return (
    <article className={`task-row task-row--${task.section} ${active ? "task-row--active" : ""}`.trim()}>
      <button
        className="task-row__main"
        type="button"
        onClick={() => onOpen(task)}
        aria-label={`打开会话：${task.title}`}
      >
        <span className="task-row__mark" aria-hidden="true">
          {attention ? <MapleStatusMark attention /> : <span className="task-row__quiet-mark" />}
        </span>
        <span className="task-row__content">
          <span className="task-row__title">{task.title}</span>
          <span className="task-row__meta">
            <span>{task.projectName}</span>
            <span className="task-row__separator">·</span>
            <time dateTime={task.updatedAt}>{formatRelativeTime(task.updatedAt)}</time>
          </span>
        </span>
      </button>
    </article>
  );
}
