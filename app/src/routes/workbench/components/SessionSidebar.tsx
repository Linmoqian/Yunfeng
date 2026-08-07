import { Input, Segmented, Button } from "antd";
import { Plus, Search, FolderGit2 } from "lucide-react";

import { MapleStatusMark } from "../../../features/workbench/MapleStatusMark";
import { TaskRow } from "../../../features/workbench/TaskRow";
import type { TaskSectionGroup, TaskSummary } from "../../../features/workbench/taskPresentation";
import type { ArchivedFilter } from "../../../store/workbenchSlice";

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
  const conversations = sections.flatMap((section) => section.tasks);

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
          {taskCount}
          {attentionCount > 0 ? ` · ${attentionCount} 待处理` : ""}
        </span>
      </div>

      <Button
        type="primary"
        block
        className="session-sidebar__new-task"
        icon={<Plus size={16} />}
        onClick={onNewTask}
      >
        新建任务
      </Button>

      <div className="session-sidebar__filters">
        <div className="session-sidebar__search">
          <Search size={14} className="session-sidebar__search-icon" aria-hidden="true" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="搜索任务…"
            autoComplete="off"
            allowClear
            variant="borderless"
          />
        </div>
        <div className="session-sidebar__filter-row">
          <div className="session-sidebar__project-field">
            <FolderGit2 size={13} className="session-sidebar__search-icon" aria-hidden="true" />
            <select
              className="session-sidebar__project-select"
              value={projectFilter}
              onChange={(event) => onProjectFilter(event.target.value)}
              aria-label="按项目筛选"
            >
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project} value={project}>{project}</option>
              ))}
            </select>
          </div>
          <Segmented
            size="small"
            value={archivedFilter === "all" ? "all" : archivedFilter}
            onChange={(value) => onArchivedFilter(value as ArchivedFilter)}
            options={[
              { label: "进行中", value: "active" },
              { label: "已归档", value: "archived" },
            ]}
            className="session-sidebar__segmented"
          />
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
