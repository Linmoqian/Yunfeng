import { MapleStatusMark } from "./MapleStatusMark";
import { TaskRow } from "./TaskRow";
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
  const conversations = sections
    .flatMap((section) => section.tasks)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return (
    <aside className="session-sidebar" aria-label="会话列表" aria-hidden={collapsed}>
      <a className="wordmark session-sidebar__wordmark" href="/" aria-label="Yunfeng 工作台">
        <MapleStatusMark />
        <span>Yunfeng</span>
      </a>

      <div className="session-sidebar__heading">
        <div>
          <p className="eyebrow">全部会话</p>
          <h2>对话</h2>
        </div>
        <span className="session-sidebar__count">{taskCount}</span>
      </div>

      <button className="button button--primary session-sidebar__new-task" type="button" onClick={onNewTask}>
        新建会话
      </button>

      {conversations.length > 0 ? (
        <nav className="session-sidebar__sections" aria-label="最近会话">
          <div className="session-sidebar__conversation-list">
            {conversations.map((conversation) => (
              <TaskRow
                key={conversation.id}
                task={conversation}
                active={conversation.id === activeTaskId}
                onOpen={onOpenTask}
              />
            ))}
          </div>
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
