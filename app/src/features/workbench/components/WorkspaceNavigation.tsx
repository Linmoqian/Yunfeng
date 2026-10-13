/* LianAgent 工作区导航：项目树、会话、团队与设置入口。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { App, Dropdown, Input } from "antd";
import { Archive, ChevronDown, ChevronRight, Folder, FolderPlus, MessageSquare, MessageSquarePlus, MoreHorizontal, Plus, Search, Settings, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskSummary } from "../taskPresentation";
import yundianPalace from "../../../assets/generated/yundian-palace.png";
import yuncongCloud from "../../../assets/generated/yuncong-cloud.png";
import { MapleStatusMark } from "../MapleStatusMark";
import { buildTaskSections } from "../taskPresentation";
import styles from "./WorkspaceShell.module.css";

export interface WorkspaceNavigationProps {
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
  function row(task: TaskSummary) {
    return <Dropdown key={task.id} trigger={["contextMenu"]} menu={{ items: [
      { key: "open", label: "打开会话" }, { key: "pin", label: pinned.includes(task.id) ? "取消置顶" : "置顶会话" },
      ...(!task.isLegacy ? [{ key: "rename", label: "重命名" }, task.section === "archived" ? { key: "reopen", label: "恢复会话" } : { key: "archive", label: "归档", danger: true }] : []),
    ], onClick: ({ key }) => {
      if (key === "open") props.onOpen(task);
      if (key === "pin") setPinned((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id]);
      if (key === "rename") { let name = task.title; modal.confirm({ title: "重命名会话", icon: null,
        content: <Input defaultValue={name} aria-label="会话名称" onChange={(event) => { name = event.target.value; }} />,
        okText: "保存", cancelText: "取消", onOk: () => props.onRename(task.id, name.trim()) }); }
      if (key === "archive") modal.confirm({ title: `归档“${task.title}”？`, content: "归档后仍可恢复。", okText: "归档", cancelText: "取消", onOk: () => props.onArchive(task.id) });
      if (key === "reopen") modal.confirm({ title: `恢复“${task.title}”？`, okText: "恢复", cancelText: "取消", onOk: () => props.onReopen(task.id) });
    }}}>
      <div className={styles.conversationRow} data-active={props.activeId === task.id || undefined}>
        <button type="button" className={styles.navButton} onClick={() => props.onOpen(task)} aria-label={`打开任务：${task.title}`} title={task.title}>
          {task.isLegacy ? <MapleStatusMark /> : <MessageSquare size={14} />}<span>{pinned.includes(task.id) ? "· " : ""}{task.title}</span>
        </button>
        <button type="button" className={styles.iconButton} aria-label={`打开“${task.title}”操作菜单`} onClick={(event) => {
          event.currentTarget.parentElement?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: event.clientX, clientY: event.clientY }));
        }}><MoreHorizontal size={14} /></button>
      </div>
    </Dropdown>;
  }
  const sorted = (tasks: TaskSummary[]) => [...tasks].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
  const personalSections = buildTaskSections(props.tasks.filter((task) => !task.isLegacy), props.archived);
  return <nav className={styles.navigation} aria-label="工作区导航">
    <button type="button" className={`${styles.navButton} ${styles.newChat}`} onClick={props.onNew} aria-label="新建任务"><MessageSquarePlus size={16} /><span>新建任务</span></button>
    <button type="button" className={styles.navButton} onClick={() => props.onUtility("resources", "资源")} aria-label="打开资源"><Folder size={16} /><span>资源</span></button>
    <button type="button" className={styles.navButton} onClick={() => props.onUtility("board", "云殿")} aria-label="打开云殿"><img src={yundianPalace} alt="" width={18} height={18} /><span>云殿</span></button>
    <div className={styles.search}><Search size={15} /><input type="search" value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="寻觅" aria-label="搜索工作区" onKeyDown={(event) => { if (event.key === "Escape") props.onSearch(""); }} />
      {props.search && <button type="button" className={styles.iconButton} onClick={() => props.onSearch("")} aria-label="清除搜索"><X size={12} /></button>}
    </div>
    <div className={styles.records}>
      <div className={styles.sectionLabel}><MessageSquare size={14} /><strong>个人会话</strong><span>{props.tasks.filter((task) => !task.isLegacy).length}</span><button type="button" className={styles.iconButton} aria-label={props.archived ? "返回活动会话" : "查看归档会话"} onClick={() => props.onArchivedChange(!props.archived)}><Archive size={14} /></button></div>
      {personalSections.map((section) => <section key={section.id}><div className={styles.sectionLabel}><strong>{section.label}</strong></div>{sorted(section.tasks).map(row)}</section>)}
      <div className={styles.sectionLabel}><img src={yuncongCloud} alt="" width={18} height={18} /><strong>云丛</strong><span>{groups.length + localProjects.length}</span><button type="button" className={styles.iconButton} onClick={newProject} aria-label="新建项目"><FolderPlus size={14} /></button></div>
      {groups.map((group) => {
        const open = expanded.includes(group.id) || Boolean(props.search);
        return <section key={group.id}>
          <div className={styles.projectRow}>
            <button type="button" className={styles.iconButton} aria-label={`${open ? "收起" : "展开"}${group.title}会话`} aria-expanded={open} onClick={() => setExpanded((current) => open ? current.filter((id) => id !== group.id) : [...current, group.id])}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            <button type="button" className={styles.navButton} onClick={() => { setExpanded((current) => [...new Set([...current, group.id])]); if (group.tasks[0]) props.onOpen(group.tasks[0]); }} title={group.id}>
              <img src={yuncongCloud} alt="" width={18} height={18} /><span className={styles.projectInitial}>{group.title.slice(0, 1)}</span><span className={styles.projectName}>{group.title}</span>
            </button>
            <button type="button" className={styles.iconButton} onClick={props.onNew} aria-label={`在${group.title}中新建会话`}><Plus size={14} /></button>
          </div>
          {open && <div className={styles.projectRows}>{sorted(group.tasks).map(row)}</div>}
        </section>;
      })}
      {localProjects.map((name, index) => <section key={`${name}-${index}`}><div className={styles.projectRow}><button className={styles.navButton} type="button" onClick={props.onNew}><Folder size={16} /><span>{name}</span></button><button className={styles.iconButton} type="button" aria-label={`移除空项目${name}`} onClick={() => setLocalProjects((current) => current.filter((_, i) => i !== index))}><X size={14} /></button></div></section>)}
      {!props.tasks.length && <div className={styles.empty}><MessageSquare size={20} /><p>{props.search ? "没有匹配的会话" : "还没有会话"}</p></div>}
    </div>
    <footer className={styles.navFooter}>
      <button type="button" className={styles.navButton} onClick={props.onTeam} aria-label="打开团队"><Users size={16} /><span>团队</span></button>
      <button type="button" className={styles.navButton} onClick={props.onSettings} aria-label="打开设置"><Settings size={16} /><span>设置</span></button>
    </footer>
  </nav>;
}
