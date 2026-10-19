/* LianAgent 工作区导航：项目树、会话、团队与设置入口。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { App, Input } from "antd";
import { Archive, ChevronRight, Folder, FolderPlus, MessageSquare, MessageSquarePlus, Plus, Search, Settings, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TaskSummary } from "../taskPresentation";
import yundianPalace from "../../../assets/generated/yundian-palace.png";
import yuncongCloud from "../../../assets/generated/yuncong-cloud.png";
import { NavigationGroup, NavigationReveal } from "./NavigationGroup";
import { NavigationTaskRow } from "./NavigationTaskRow";
import { NavigationLoadState } from "./NavigationLoadState";
import { NavigationModes, type ConversationFilter } from "./NavigationModes";
import { buildTaskSections } from "../taskPresentation";
import styles from "./WorkspaceShell.module.css";

export interface WorkspaceNavigationProps {
  loading?: boolean; error?: string | null; onRetry?: () => void;
  tasks: TaskSummary[]; activeId?: string; search: string; onSearch: (value: string) => void;
  onOpen: (task: TaskSummary) => void; onNew: () => void; onUtility: (id: string, title: string) => void;
  onTeam: () => void; onSettings: () => void;
  onRename: (id: string, title: string) => Promise<void>; onArchive: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>; archived: boolean; onArchivedChange: (value: boolean) => void;
}
export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const { modal } = App.useApp();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [localProjects, setLocalProjects] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [modeFilter, setModeFilter] = useState<ConversationFilter>("all");
  const groups = useMemo(() => {
    const grouped = new Map<string, TaskSummary[]>();
    for (const task of props.tasks) {
      if (!task.cwd || !task.isLegacy) continue;
      const key = task.cwd;
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }
    return [...grouped.entries()].map(([id, tasks]) => ({ id, title: tasks[0].projectName, tasks }));
  }, [props.tasks]);
  function newProject() {
    let name = "";
    const dialog = modal.confirm({ title: "新建工作区项目", icon: null, okButtonProps: { disabled: true }, content: <div>
      <p>项目名称保存在当前界面中，用于组织工作区。</p>
      <Input aria-label="项目名称" placeholder="项目名称" maxLength={80} onChange={(event) => { name = event.target.value; dialog.update({ okButtonProps: { disabled: !name.trim() } }); }} />
    </div>, okText: "创建", cancelText: "取消", onOk: () => { if (name.trim()) setLocalProjects((current) => [...current, name.trim()]); } });
  }
  const sorted = (tasks: TaskSummary[]) => [...tasks].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const personal = props.tasks.filter((task) => !task.isLegacy && (props.archived ? task.section === "archived" : task.section !== "archived"));
  const visible = personal.filter((task) => modeFilter === "all" || (task.mode ?? "development") === modeFilter);
  const pinnedTasks = sorted(visible.filter((task) => pinned.includes(task.id)));
  const personalSections = buildTaskSections(visible.filter((task) => !pinned.includes(task.id)), props.archived);
  const activeTask = personal.find((task) => task.id === props.activeId);
  const activeMode = activeTask ? activeTask.mode ?? "development" : undefined;
  useEffect(() => {
    // 外部打开会话时让所选会话可见；手动筛选不切换当前会话或输入模式。
    setModeFilter((current) => activeMode && current !== "all" && current !== activeMode ? "all" : current);
  }, [props.activeId, activeMode]);
  const activeGroup = pinnedTasks.some((task) => task.id === props.activeId) ? "pinned" : personalSections.find((group) => group.tasks.some((task) => task.id === props.activeId))?.id;
  const activeProject = groups.find((group) => group.tasks.some((task) => task.id === props.activeId))?.id;
  useEffect(() => {
    if (activeGroup) setCollapsed((current) => current.filter((id) => id !== activeGroup));
    if (activeProject) setExpanded((current) => [...new Set([...current, activeProject])]);
    // 仅在选择或所属分组变化时展开，列表同步不覆盖手动折叠。
  }, [props.activeId, activeGroup, activeProject]);
  const searching = Boolean(props.search.trim());
  function row(task: TaskSummary) {
    return <NavigationTaskRow key={task.id} task={task} active={props.activeId === task.id} pinned={pinned.includes(task.id)}
      onPin={() => setPinned((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])}
      onOpen={props.onOpen} onRename={props.onRename} onArchive={props.onArchive} onReopen={props.onReopen} />;
  }
  const toggle = (id: string) => setCollapsed((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <nav className={styles.navigation} aria-label="工作区导航">
    <button type="button" className={`${styles.navButton} ${styles.newChat}`} onClick={props.onNew} aria-label="新建任务"><MessageSquarePlus size={16} /><span>新建任务</span></button>
    <button type="button" className={styles.navButton} onClick={() => props.onUtility("resources", "资源")} aria-label="打开资源"><Folder size={16} /><span>资源</span></button>
    <button type="button" className={styles.navButton} onClick={() => props.onUtility("board", "云殿")} aria-label="打开云殿"><img src={yundianPalace} alt="" width={18} height={18} /><span>云殿</span></button>
    <div className={styles.search}><Search size={15} /><input type="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="寻觅" aria-label="搜索工作区" onKeyDown={(event) => { if (event.key === "Escape") props.onSearch(""); }} />
      {props.search && <button type="button" className={styles.iconButton} onClick={() => props.onSearch("")} aria-label="清除搜索"><X size={12} /></button>}
    </div>
    <div className={styles.records} aria-busy={props.loading || undefined}>
      <div className={styles.sectionLabel}><MessageSquare size={14} /><strong>{props.archived ? "归档会话" : "个人会话"}</strong><span>{!props.tasks.length && (props.loading || props.error) ? "—" : personal.length}</span><button type="button" className={styles.iconButton} aria-label={props.archived ? "返回活动会话" : "查看归档会话"} onClick={() => props.onArchivedChange(!props.archived)}><Archive size={14} /></button></div>
      <NavigationLoadState loading={props.loading} error={props.error} hasItems={props.tasks.length > 0} onRetry={props.onRetry} />
      {personal.length > 0 && <NavigationModes tasks={personal} value={modeFilter} onChange={setModeFilter} />}
      {pinnedTasks.length > 0 && <NavigationGroup label="置顶" count={pinnedTasks.length} open={searching || !collapsed.includes("pinned")} onToggle={() => toggle("pinned")}>{pinnedTasks.map(row)}</NavigationGroup>}
      {personalSections.map((section) => <NavigationGroup key={section.id} label={section.label} count={section.tasks.length} tone={section.id}
        open={searching || !collapsed.includes(section.id)} onToggle={() => toggle(section.id)}>{section.tasks.map(row)}</NavigationGroup>)}
      {personal.length > 0 && !visible.length && <div className={styles.empty}>没有匹配的{modeFilter === "research" ? "科研" : "开发"}会话</div>}
      <div className={styles.sectionLabel}><img src={yuncongCloud} alt="" width={18} height={18} /><strong>云丛</strong><span>{groups.length + localProjects.length}</span><button type="button" className={styles.iconButton} onClick={newProject} aria-label="新建项目"><FolderPlus size={14} /></button></div>
      {groups.map((group) => {
        const open = expanded.includes(group.id) || searching;
        return <section key={group.id}>
          <div className={styles.projectRow}>
            <button type="button" className={styles.iconButton} aria-label={`${open ? "收起" : "展开"}${group.title}会话`} aria-expanded={open} onClick={() => setExpanded((current) => open ? current.filter((id) => id !== group.id) : [...current, group.id])}><ChevronRight size={14} className={styles.projectChevron} data-open={open} /></button>
            <button type="button" className={styles.navButton} onClick={() => { setExpanded((current) => [...new Set([...current, group.id])]); if (group.tasks[0]) props.onOpen(group.tasks[0]); }} title={group.id}>
              <img src={yuncongCloud} alt="" width={18} height={18} /><span className={styles.projectInitial}>{group.title.slice(0, 1)}</span><span className={styles.projectName}>{group.title}</span>
            </button>
            <button type="button" className={styles.iconButton} onClick={props.onNew} aria-label={`在${group.title}中新建会话`}><Plus size={14} /></button>
          </div>
          <NavigationReveal open={open}><div className={styles.projectRows}>{sorted(group.tasks).map(row)}</div></NavigationReveal>
        </section>;
      })}
      {localProjects.map((name, index) => <section key={`${name}-${index}`}><div className={styles.projectRow}><button className={styles.navButton} type="button" onClick={props.onNew}><Folder size={16} /><span>{name}</span></button><button className={styles.iconButton} type="button" aria-label={`移除空项目${name}`} onClick={() => setLocalProjects((current) => current.filter((_, i) => i !== index))}><X size={14} /></button></div></section>)}
      {!props.tasks.length && !props.loading && !props.error && <div className={styles.empty}><MessageSquare size={20} /><p>{props.search ? "没有匹配的会话" : "还没有会话"}</p></div>}
    </div>
    <footer className={styles.navFooter}>
      <button type="button" className={styles.navButton} onClick={props.onTeam} aria-label="打开团队"><Users size={16} /><span>团队</span></button>
      <button type="button" className={styles.navButton} onClick={props.onSettings} aria-label="打开设置"><Settings size={16} /><span>设置</span></button>
    </footer>
  </nav>;
}
