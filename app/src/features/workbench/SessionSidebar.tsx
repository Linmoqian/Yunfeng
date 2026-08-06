import { MapleStatusMark } from "./MapleStatusMark";
import { TaskRow } from "./TaskRow";
import type { TaskSectionGroup, TaskSummary } from "./taskPresentation";

type ArchivedFilter = "all" | "active" | "archived";

interface SessionSidebarProps {
  sections: TaskSectionGroup[];
  taskCount: number;
  attentionCount: number;
  activeTaskId?: string;
  collapsed: boolean;
  search: string;
  onSearch: (value: string) => void;
  projectFilter: string;
  projects: string[];
  onProjectFilter: (value: string) => void;
  archivedFilter: ArchivedFilter;
  onArchivedFilter: (value: ArchivedFilter) => void;
  onOpenTask: (task: TaskSummary) => void;
  onNewTask: () => void;
  onRename: (taskId: string, name: string) => Promise<void>;
  onArchive: (taskId: string) => Promise<void>;
  onReopen: (taskId: string) => Promise<void>;
}

export function SessionSidebar({
  sections,
  taskCount,
  attentionCount,
  activeTaskId,
  collapsed,
  search,
  onSearch,
  projectFilter,
  projects,
  onProjectFilter,
  archivedFilter,
  onArchivedFilter,
  onOpenTask,
  onNewTask,
  onRename,
  onArchive,
  onReopen,
}: SessionSidebarProps) {
  const conversations = sections
    .flatMap((section) => section.tasks)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  return (
    <aside className="session-sidebar" aria-label="任务列表" aria-hidden={collapsed}>
      <a className="wordmark session-sidebar__wordmark" href="/" aria-label="Yunfeng 工作台">
        <MapleStatusMark />
        <span>Yunfeng</span>
      </a>

      <div className="session-sidebar__heading">
        <div>
          <p className="eyebrow">任务工作台</p>
          <h2>任务</h2>
        </div>
        <span className="session-sidebar__count">
          {taskCount}{attentionCount > 0 ? ` · ${attentionCount} 待处理` : ""}
        </span>
      </div>

      <button className="button button--primary session-sidebar__new-task" type="button" onClick={onNewTask}>
        新建任务
      </button>

      <div className="session-sidebar__filters">
        <label className="session-sidebar__search" htmlFor="task-search" aria-label="搜索任务">
          <span className="session-sidebar__search-icon" aria-hidden="true">⌕</span>
          <input
            id="task-search"
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="搜索任务…"
            autoComplete="off"
          />
        </label>
        <div className="session-sidebar__filter-row">
          <label htmlFor="project-filter" className="sr-only">按项目筛选</label>
          <select
            id="project-filter"
            value={projectFilter}
            onChange={(event) => onProjectFilter(event.target.value)}
            aria-label="按项目筛选"
          >
            <option value="">全部项目</option>
            {projects.map((project) => (
              <option key={project} value={project}>{project}</option>
            ))}
          </select>
          <div className="session-sidebar__segmented" role="group" aria-label="归档筛选">
            {([
              ["active", "进行中"],
              ["archived", "已归档"],
            ] as Array<[ArchivedFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`session-sidebar__segment${archivedFilter === value ? " session-sidebar__segment--active" : ""}`}
                onClick={() => onArchivedFilter(value)}
                aria-pressed={archivedFilter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {conversations.length > 0 ? (
        <nav className="session-sidebar__sections" aria-label="最近任务">
          <div className="session-sidebar__conversation-list">
            {sections.map((section) => (
              <section key={section.id} className={`session-sidebar__group session-sidebar__group--${section.id}`} aria-label={section.label}>
                <div className="session-sidebar__group-heading">
                  <span>{section.label}</span>
                  <span className="session-sidebar__group-count">{section.tasks.length}</span>
                </div>
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    active={task.id === activeTaskId}
                    onOpen={onOpenTask}
                    onRename={onRename}
                    onArchive={onArchive}
                    onReopen={onReopen}
                  />
                ))}
              </section>
            ))}
          </div>
        </nav>
      ) : (
        <div className="session-sidebar__empty">
          <MapleStatusMark />
          <p>{search || projectFilter || archivedFilter === "archived" ? "没有匹配的任务" : "还没有任务"}</p>
          <span>{search || projectFilter || archivedFilter === "archived" ? "换个筛选条件试试。" : "从一个清晰的目标开始。"}</span>
        </div>
      )}

      <p className="session-sidebar__footer">任务状态由后端领域状态提供，与 pi 会话保持同步。</p>
    </aside>
  );
}
