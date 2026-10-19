import { ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
import type { TaskState } from "@/lib/types";
import { BOARD_COLUMNS, groupTasksByStatus, statusLabel } from "@/lib/taskLabels";

interface TaskBoardProps {
  tasks: TaskState[];
  loading: boolean;
  onBack: () => void;
  onNewTask: () => void;
  onPick: (task: TaskState) => void;
  onMore: (task: TaskState) => void;
}

/** 任务看板：按状态分列、横向滚动吸附；点击卡片回到对话，更多按钮打开操作单。 */
export function TaskBoard({ tasks, loading, onBack, onNewTask, onPick, onMore }: TaskBoardProps) {
  const groups = groupTasksByStatus(tasks);

  return (
    <div className="task-board">
      <div className="task-board-header" data-tauri-drag-region>
        <button type="button" className="icon-button" title="返回对话" onClick={onBack}>
          <ChevronLeft size={17} />
        </button>
        <div className="task-board-title">
          <strong>任务看板</strong>
          <span>{loading ? "加载中…" : `${tasks.length} 个任务`}</span>
        </div>
        <button type="button" className="icon-button" title="新建任务" onClick={onNewTask}>
          <Plus size={16} />
        </button>
      </div>

      <div className="task-board-scroll">
        {BOARD_COLUMNS.map((column) => {
          const columnTasks = groups.get(column.status) ?? [];
          return (
            <section key={column.status} className="board-column">
              <header className="board-column-header">
                <span className="board-column-dot" style={{ background: column.dotVar }} />
                {column.label}
                <span className="board-column-count">{columnTasks.length}</span>
              </header>
              <div className="board-column-body">
                {columnTasks.length === 0 && <div className="board-column-empty">暂无任务</div>}
                {columnTasks.map((task) => (
                  <div key={task.id} className="board-card">
                    <button
                      type="button"
                      className="board-card-main"
                      onClick={() => onPick(task)}
                      title={task.cwd}
                    >
                      <span className="board-card-title">{task.title || "未命名任务"}</span>
                      <span className={`board-card-status${task.status === "running" ? " is-running" : ""}`}>
                        {statusLabel(task)}
                      </span>
                      <small>
                        {task.updatedAt ? new Date(task.updatedAt).toLocaleString() : ""}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="board-card-more"
                      title="任务操作"
                      onClick={() => onMore(task)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
