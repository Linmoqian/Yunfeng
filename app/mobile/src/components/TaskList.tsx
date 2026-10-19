import { ListTodo, MoreHorizontal } from "lucide-react";
import type { TaskState } from "@/lib/types";
import { statusLabel } from "@/lib/taskLabels";

interface TaskListProps {
  tasks: TaskState[];
  loading: boolean;
  activeId: string | null;
  onPick: (task: TaskState) => void;
  onMore: (task: TaskState) => void;
}

/** 任务列表：标题、当前状态与更新时间；更多按钮打开任务操作单。 */
export function TaskList({ tasks, loading, activeId, onPick, onMore }: TaskListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading">
        <span>Agent 任务</span>
      </div>
      {loading && <div className="empty-hint">加载中…</div>}
      {loading === false && tasks.length === 0 && <div className="empty-hint">暂无任务，点击 + 新建</div>}
      {tasks.map((task) => {
        const active = activeId === task.id;
        return (
          <div key={task.id} className={`session-item-wrap${active ? " is-active" : ""}`}>
            <button
              type="button"
              className="session-item task-item-main"
              onClick={() => onPick(task)}
              title={task.cwd}
            >
              <ListTodo size={15} />
              <span className="task-list-title">
                {task.title || "未命名任务"}
                <small className={task.status === "running" ? "task-status is-running" : "task-status"}>
                  {statusLabel(task)}
                </small>
              </span>
              <small>{task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : ""}</small>
            </button>
            <button
              type="button"
              className="task-more-button"
              title="任务操作"
              onClick={() => onMore(task)}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
