import { ListTodo } from "lucide-react";
import type { TaskState } from "@/lib/types";

interface TaskListProps {
  tasks: TaskState[];
  loading: boolean;
  activeId: string | null;
  onPick: (task: TaskState) => void;
}

function statusLabel(task: TaskState): string {
  switch (task.status) {
    case "running":
      return task.currentAction || "运行中";
    case "waiting_approval":
      return "待审批";
    case "waiting_input":
      return "待输入";
    case "failed":
      return "失败";
    case "completed":
      return "已完成";
    case "archived":
      return "已归档";
    default:
      return task.status;
  }
}

/** 任务列表：标题、当前状态与更新时间。数据来自电脑侧网关。 */
export function TaskList({ tasks, loading, activeId, onPick }: TaskListProps) {
  return (
    <div className="sidebar-section">
      <div className="section-heading">
        <span>Agent 任务</span>
      </div>
      {loading && <div className="empty-hint">加载中…</div>}
      {!loading && tasks.length === 0 && <div className="empty-hint">暂无任务，点击 + 新建</div>}
      {tasks.map((task) => {
        const active = activeId === task.id;
        return (
          <button
            key={task.id}
            className={`session-item${active ? " is-active" : ""}`}
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
        );
      })}
    </div>
  );
}
