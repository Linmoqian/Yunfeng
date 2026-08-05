import { MapleStatusMark } from "./MapleStatusMark";
import { TaskSection } from "./TaskSection";
import type { TaskSectionGroup, TaskSummary } from "./taskPresentation";

interface SessionSidebarProps {
  sections: TaskSectionGroup[];
  taskCount: number;
  activeTaskId?: string;
  collapsed: boolean;
  onOpenTask: (task: TaskSummary) => void;
  onNewTask: () => void;
}

export function SessionSidebar({
  sections,
  taskCount,
  activeTaskId,
  collapsed,
  onOpenTask,
  onNewTask,
}: SessionSidebarProps) {
  return (
    <aside className="session-sidebar" aria-label="会话列表" aria-hidden={collapsed}>
      <a className="wordmark session-sidebar__wordmark" href="/" aria-label="Yunfeng 工作台">
        <MapleStatusMark />
        <span>Yunfeng</span>
      </a>

      <div className="session-sidebar__heading">
        <div>
          <p className="eyebrow">任务脉络</p>
          <h2>会话</h2>
        </div>
        <span className="session-sidebar__count">{taskCount}</span>
      </div>

      <button className="button button--primary session-sidebar__new-task" type="button" onClick={onNewTask}>
        新建任务
      </button>

      {sections.length > 0 ? (
        <nav className="session-sidebar__sections" aria-label="会话分组">
          {sections.map((section) => (
            <TaskSection
              key={section.id}
              section={section}
              activeTaskId={activeTaskId}
              onOpenTask={onOpenTask}
            />
          ))}
        </nav>
      ) : (
        <div className="session-sidebar__empty">
          <MapleStatusMark />
          <p>还没有会话</p>
          <span>从一个清晰的目标开始。</span>
        </div>
      )}

      <p className="session-sidebar__footer">会话会和 pi 的持久化记录保持同步。</p>
    </aside>
  );
}
