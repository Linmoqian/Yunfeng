/* 会话行保留原任务操作，置顶与状态使用轻量标识。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { App, Dropdown, Input, type MenuProps } from "antd";
import { Check, CircleAlert, Clock3, LoaderCircle, MessageSquare, MoreHorizontal, Pin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { TaskSummary } from "../taskPresentation";
import { MapleStatusMark } from "../MapleStatusMark";
import type { WorkspaceNavigationProps } from "./WorkspaceNavigation";
import shell from "./WorkspaceShell.module.css";
import styles from "./WorkspaceNavigation.module.css";

interface NavigationTaskRowProps extends Pick<WorkspaceNavigationProps, "onOpen" | "onRename" | "onArchive" | "onReopen"> {
  task: TaskSummary; active: boolean; pinned: boolean; onPin: () => void;
}
export function NavigationTaskRow({ task, active, pinned, onPin, ...actions }: NavigationTaskRowProps) {
  const { modal } = App.useApp();
  const reduced = useReducedMotion();
  const StatusIcon = task.section === "running" ? LoaderCircle : task.section === "completed" ? Check
    : task.section === "attention" || task.section === "waiting_approval" ? CircleAlert : task.section === "waiting" ? Clock3 : MessageSquare;
  const menu: MenuProps = { items: [
    { key: "open", label: "打开会话" }, { key: "pin", label: pinned ? "取消置顶" : "置顶会话" },
    ...(!task.isLegacy ? [{ key: "rename", label: "重命名" }, task.section === "archived" ? { key: "reopen", label: "恢复会话" } : { key: "archive", label: "归档", danger: true }] : []),
  ], onClick: ({ key }) => {
    if (key === "open") actions.onOpen(task);
    if (key === "pin") onPin();
    if (key === "rename") { let name = task.title; modal.confirm({ title: "重命名会话", icon: null,
      content: <Input defaultValue={name} aria-label="会话名称" onChange={(event) => { name = event.target.value; }} />,
      okText: "保存", cancelText: "取消", onOk: () => actions.onRename(task.id, name.trim()) }); }
    if (key === "archive") modal.confirm({ title: `归档“${task.title}”？`, content: "归档后仍可恢复。", okText: "归档", cancelText: "取消", onOk: () => actions.onArchive(task.id) });
    if (key === "reopen") modal.confirm({ title: `恢复“${task.title}”？`, okText: "恢复", cancelText: "取消", onOk: () => actions.onReopen(task.id) });
  }};
  return <motion.div layout={reduced ? false : "position"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0 : 0.14 }}>
    <Dropdown trigger={["contextMenu"]} menu={menu}><div className={`${shell.conversationRow} ${styles.row}`} data-active={active || undefined}>
      <button type="button" className={shell.navButton} onClick={() => actions.onOpen(task)} aria-current={active ? "page" : undefined}
        aria-label={`打开任务：${task.title}`} title={`${task.title}\n${task.statusLabel}${task.attentionReason ? ` · ${task.attentionReason}` : ""}`}>
        {task.isLegacy ? <MapleStatusMark /> : <StatusIcon size={14} className={styles.statusIcon} data-tone={task.section} aria-hidden="true" />}<span>{task.title}</span>
      </button>
      {pinned && <Pin data-navigation-pin size={11} className={styles.pin} aria-label="已置顶" />}
      <Dropdown trigger={["click"]} menu={menu}>
        <button type="button" className={shell.iconButton} aria-label={`打开“${task.title}”操作菜单`}><MoreHorizontal size={14} /></button>
      </Dropdown>
    </div></Dropdown>
  </motion.div>;
}
