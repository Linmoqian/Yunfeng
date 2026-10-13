/* LianAgent 的固定工作台标签与工具扩展中心，接入 Yunfeng 任务列表。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import { Button, Checkbox, Dropdown, Modal, Tabs } from "antd";
import { ChevronDown, ChevronRight, FolderOpen, ListTodo, Maximize2, MonitorSmartphone, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { WORKBENCH_TOOLS } from "../workbenchTools";
import { SESSION_ENTER } from "../workspaceMotion";
import type { TaskSummary } from "../taskPresentation";
import shell from "./WorkspaceShell.module.css";
import styles from "./UtilityPanels.module.css";

export function WorkspaceWorkbench({ tasks, onOpen, onUtility, infoRef }: {
  tasks: TaskSummary[]; onOpen: (task: TaskSummary) => void; onUtility: (id: string, title: string) => void;
  infoRef: (node: HTMLDivElement | null) => void;
}) {
  const [active, setActive] = useState("task");
  const [tools, setTools] = useState<string[]>(["resources", "writing"]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [manage, setManage] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const chooser = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const tabDefinitions = [
    { id: "task", label: "任务", icon: ListTodo },
    { id: "files", label: "文件", icon: FolderOpen }, { id: "devices", label: "设备", icon: MonitorSmartphone },
  ];
  return <div className={styles.pane}>
    <div className={styles.sectionTitle} data-workbench-content><Tabs size="small" activeKey={active} onChange={setActive} items={tabDefinitions.map((tab) => ({ key: tab.id, label: <span title={tab.label} aria-label={tab.label}><tab.icon size={17} /></span> }))} />
      <Dropdown trigger={["click"]} menu={{ items: [...WORKBENCH_TOOLS.map((tool) => ({ key: tool.id, label: tool.label, icon: <tool.icon size={14} />, disabled: tools.includes(tool.id) })), { type: "divider" }, { key: "manage", label: "工作台拓展中心" }], onClick: ({ key }) => {
        if (key === "manage") setManage(true); else { setTools((current) => [...current, key]); setActive("task"); }
      } }}><button className={shell.iconButton} type="button" aria-label="添加或管理工具"><Plus size={16} /></button></Dropdown>
    </div>
    <div className={styles.rail} data-workbench-rail>{tabDefinitions.map((tab) => <button key={tab.id} className={shell.iconButton} type="button" title={tab.label} aria-label={`查看${tab.label}`} onClick={() => { setActive(tab.id); onUtility(tab.id === "task" ? "board" : `workbench-${tab.id}`, tab.id === "task" ? "云殿" : tab.label); }}><tab.icon size={17} /></button>)}</div>
    <div ref={infoRef} hidden={active !== "task"} />
    <motion.div data-workbench-content key={active} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={SESSION_ENTER}>
      {active === "task" && <>
        <div className={styles.sectionTitle}><strong>当前任务</strong><button className={shell.iconButton} type="button" aria-label="打开云殿" onClick={() => onUtility("board", "云殿")}><Maximize2 size={14} /></button></div>
        {tasks.filter((task) => !task.isLegacy).slice(0, 6).map((task) => <button key={task.id} className={shell.navButton} type="button" onClick={() => onOpen(task)}><ListTodo size={14} /><span>{task.title}</span></button>)}
        {!tasks.some((task) => !task.isLegacy) && <p className={styles.hint}>还没有任务，从新建会话开始。</p>}
        {tools.map((id) => {
          const tool = WORKBENCH_TOOLS.find((item) => item.id === id);
          if (!tool) return null;
          const closed = collapsed.includes(id);
          return <section className={styles.toolCard} key={id}>
            <header className={styles.toolHeader}><button type="button" aria-expanded={!closed} onClick={() => setCollapsed((current) => closed ? current.filter((item) => item !== id) : [...current, id])}>{closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<tool.icon size={15} /><span>{tool.label}</span></button>
              <button type="button" className={shell.iconButton} onClick={() => onUtility(`tool-${id}`, tool.label)} aria-label={`在中央打开${tool.label}`}><Maximize2 size={13} /></button>
              <button type="button" className={shell.iconButton} onClick={() => setTools((current) => current.filter((item) => item !== id))} aria-label={`移除${tool.label}模块`}><X size={13} /></button>
            </header>
            {!closed && <div className={styles.toolContent}><p className={styles.hint}>{tool.description}</p><Button size="small" block onClick={() => onUtility(`tool-${id}`, tool.label)}>打开{tool.label}</Button></div>}
          </section>;
        })}
      </>}
      {active === "files" && <div className={styles.fields}><Button onClick={() => chooser.current?.click()}>选择文件</Button><input type="file" hidden multiple ref={chooser} onChange={(event) => setFiles(Array.from(event.target.files ?? []).map((file) => file.name))} />{files.map((name) => <button key={name} className={shell.navButton} type="button" onClick={() => onUtility("resources", "资源")}><FolderOpen size={14} /><span>{name}</span></button>)}<p className={styles.hint}>文件仅在界面选中，未上传。</p></div>}
      {active === "devices" && <div className={styles.fields}><p className={styles.hint}>个人设备与远程连接</p><Button onClick={() => onUtility("tool-devices", "设备连接")}>管理设备</Button></div>}
    </motion.div>
    <Modal title="工作台拓展中心" open={manage} onCancel={() => setManage(false)} footer={<Button type="primary" onClick={() => setManage(false)}>完成</Button>} width={620}>
      <div className={styles.resourcesGrid}>{WORKBENCH_TOOLS.map((tool) => <div className={styles.resourceItem} key={tool.id}><tool.icon size={20} /><h3>{tool.label}</h3><p className={styles.hint}>{tool.description}</p><Checkbox checked={tools.includes(tool.id)} onChange={(event) => setTools((current) => event.target.checked ? [...current, tool.id] : current.filter((id) => id !== tool.id))}>添加到工作台</Checkbox></div>)}</div>
    </Modal>
  </div>;
}
