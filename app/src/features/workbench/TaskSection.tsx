import { TaskRow } from "./TaskRow";
import type { TaskSectionGroup, TaskSummary } from "./taskPresentation";

interface TaskSectionProps {
  section: TaskSectionGroup;
  onOpenTask: (task: TaskSummary) => void;
}

export function TaskSection({ section, onOpenTask }: TaskSectionProps) {
  if (section.id === "completed") {
    return (
      <details className="task-section task-section--completed">
        <summary className="task-section__summary">
          <span>{section.label}</span>
          <span className="task-section__count">查看 {section.tasks.length} 个</span>
        </summary>
        <div className="task-section__list">
          {section.tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onOpenTask} />)}
        </div>
      </details>
    );
  }

  return (
    <section className={`task-section task-section--${section.id}`} aria-labelledby={`section-${section.id}`}>
      <div className="task-section__heading">
        <h2 id={`section-${section.id}`}>{section.label}</h2>
        <span className="task-section__count">{section.tasks.length} 个任务</span>
      </div>
      <div className="task-section__list">
        {section.tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onOpenTask} />)}
      </div>
    </section>
  );
}
