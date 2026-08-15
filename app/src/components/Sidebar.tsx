import { Plus } from "lucide-react";
import type { TaskState } from "@/lib/types";
import type { UseTasksResult } from "@/hooks/useTasks";
import { TaskList } from "./TaskList";

interface SidebarProps {
  tasks: UseTasksResult;
  activeTaskId: string | null;
  onPickTask: (task: TaskState) => void;
  onNewTask: () => void;
}

/** 侧栏：只保留任务列表。 */
export function Sidebar({ tasks, activeTaskId, onPickTask, onNewTask }: SidebarProps) {
  return (
    <div className="sidebar-pane">
      <div className="sidebar-header" data-tauri-drag-region>
        <strong>Yunfeng</strong>
        <button type="button" className="icon-button" title="新建任务" onClick={onNewTask}>
          <Plus size={16} />
        </button>
      </div>
      <div className="sidebar-scroll">
        <TaskList
          tasks={tasks.tasks}
          loading={tasks.loading}
          activeId={activeTaskId}
          onPick={onPickTask}
        />
      </div>
    </div>
  );
}
