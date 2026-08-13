import { useMemo, useState } from "react";
import { Input, Button } from "antd";
import { ArrowUpRight, ChevronRight, Plus, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import yuncongCloud from "../../../assets/generated/yuncong-cloud.png";
import yundianPalace from "../../../assets/generated/yundian-palace.png";
import { MapleStatusMark } from "../../../features/workbench/MapleStatusMark";
import { TaskRow } from "../../../features/workbench/TaskRow";
import type { TaskSectionGroup, TaskSummary } from "../../../features/workbench/taskPresentation";

interface SessionSidebarProps {
  sections: TaskSectionGroup[];
  activeTaskId?: string;
  collapsed: boolean;
  search: string;
  onSearch: (value: string) => void;
  onOpenTask: (task: TaskSummary) => void;
  onNewTask: () => void;
  onClose: () => void;
  onRename: (taskId: string, name: string) => Promise<void>;
  onArchive: (taskId: string) => Promise<void>;
  onReopen: (taskId: string) => Promise<void>;
}

export function SessionSidebar({
  sections,
  activeTaskId,
  collapsed,
  search,
  onSearch,
  onOpenTask,
  onNewTask,
  onClose,
  onRename,
  onArchive,
  onReopen,
}: SessionSidebarProps) {
  const navigate = useNavigate();
  const regularSections = useMemo(
    () => sections.filter((s) => s.id !== "legacy"),
    [sections],
  );
  const legacySection = useMemo(
    () => sections.find((s) => s.id === "legacy"),
    [sections],
  );
  const legacyByProject = useMemo(() => {
    if (!legacySection) return [] as Array<{ project: string; tasks: TaskSummary[] }>;
    const map = new Map<string, TaskSummary[]>();
    for (const task of legacySection.tasks) {
      const arr = map.get(task.projectName) ?? [];
      arr.push(task);
      map.set(task.projectName, arr);
    }
    return [...map.entries()]
      .map(([project, tasks]) => ({ project, tasks }))
      .sort((a, b) => a.project.localeCompare(b.project));
  }, [legacySection]);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const toggleProject = (project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  };

  return (
    <aside className="session-sidebar" aria-label="任务列表" aria-hidden={collapsed}>
      <div className="session-sidebar__top">
        <a className="wordmark session-sidebar__wordmark" href="/" aria-label="Yunfeng 工作台">
          <MapleStatusMark />
          <span>Yunfeng</span>
        </a>
        <Button type="text" icon={<X size={17} />} onClick={onClose} aria-label="关闭任务列表" />
      </div>

      <div className="session-sidebar__actions">
        <Button
          type="primary"
          block
          className="session-sidebar__new-task"
          icon={<Plus size={16} />}
          onClick={onNewTask}
        >
          新建任务
        </Button>
        <button
          type="button"
          className="session-sidebar__taskboard"
          onClick={() => navigate("/taskboard")}
          aria-label="打开任务看板"
        >
          <span className="session-sidebar__taskboard-icon"><img src={yundianPalace} alt="" /></span>
          <span className="session-sidebar__taskboard-copy">
            <strong>云殿</strong>
          </span>
          <ArrowUpRight className="session-sidebar__taskboard-arrow" size={15} aria-hidden="true" />
        </button>
      </div>
      <div className="session-sidebar__search">
        <Search size={14} className="session-sidebar__search-icon" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="寻觅"
          autoComplete="off"
          allowClear
          variant="borderless"
        />
      </div>

      {sections.length > 0 ? (
        <nav className="session-sidebar__sections" aria-label="最近任务">
         <div className="session-sidebar__conversation-list">
           {regularSections.map((section) => (
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
            {legacySection ? (
              <section className="session-sidebar__group session-sidebar__group--legacy" aria-label="旧会话">
                <div className="session-sidebar__group-heading">
                  <span>{legacySection.label}</span>
                  <span className="session-sidebar__group-count">{legacySection.tasks.length}</span>
                </div>
                {legacyByProject.map(({ project, tasks }) => (
                  <div key={project} className="session-sidebar__legacy-project">
                    <button
                      type="button"
                      className="session-sidebar__legacy-project-toggle"
                      onClick={() => toggleProject(project)}
                      aria-expanded={expandedProjects.has(project)}
                    >
                      <ChevronRight
                        size={13}
                        className={expandedProjects.has(project)
                          ? "session-sidebar__legacy-chevron session-sidebar__legacy-chevron--open"
                          : "session-sidebar__legacy-chevron"}
                      />
                      <img className="session-sidebar__legacy-project-cloud" src={yuncongCloud} alt="" />
                      <span className="session-sidebar__legacy-project-name">{project}</span>
                      <span className="session-sidebar__legacy-project-count">{tasks.length}</span>
                    </button>
                    {expandedProjects.has(project) ? (
                      <div className="session-sidebar__legacy-project-items">
                        {tasks.map((task) => (
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
                      </div>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </nav>
      ) : (
        <div className="session-sidebar__empty">
          <MapleStatusMark />
          <p>{search ? "没有匹配的任务" : "还没有任务"}</p>
          {search ? <span>换个搜索词试试。</span> : null}
        </div>
      )}
    </aside>
  );
}
