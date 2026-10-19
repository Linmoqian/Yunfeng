import { KanbanSquare, ListTodo, Plus } from "lucide-react";
import type { TaskState } from "@/lib/types";
import type { UseTasksResult } from "@/hooks/useTasks";
import { MapleMark } from "./MapleMark";
import { TaskList } from "./TaskList";

interface SidebarProps {
  tasks: UseTasksResult;
  activeTaskId: string | null;
  onPickTask: (task: TaskState) => void;
  onMoreTask: (task: TaskState) => void;
  onNewTask: () => void;
  onOpenBoard: () => void;
}

/** 侧栏：任务列表 + 列表/看板视图切换。 */
export function Sidebar({ tasks, activeTaskId, onPickTask, onMoreTask, onNewTask, onOpenBoard }: SidebarProps) {
  return (
    <div className="sidebar-pane">
      <div className="sidebar-header" data-tauri-drag-region>
        <strong className="sidebar-brand">
          <MapleMark size={20} />
          Yunfeng
        </strong>
        <button type="button" className="icon-button" title="新建任务" onClick={onNewTask}>
          <Plus size={16} />
        </button>
      </div>
      <div className="sidebar-view-switch" role="group" aria-label="任务视图">
        <button type="button" className="view-switch-item is-active" title="任务列表">
          <ListTodo size={14} />
          列表
        </button>
        <button type="button" className="view-switch-item" title="任务看板" onClick={onOpenBoard}>
          <KanbanSquare size={14} />
          看板
        </button>
      </div>
      <div className="sidebar-scroll">
        <TaskList
          tasks={tasks.tasks}
          loading={tasks.loading}
          activeId={activeTaskId}
          onPick={onPickTask}
          onMore={onMoreTask}
        />
      </div>
    </div>
  );
}
