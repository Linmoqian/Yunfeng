/* 团队通讯录与渐进展开的本地设置；表单草稿保留在页面状态中。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { App, Button, Input } from "antd";
import { ArrowLeft, ChevronRight, Fingerprint, LogOut, Radio, RotateCw, Users } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import styles from "./TeamWorkspace.module.css";
import shell from "./WorkspaceShell.module.css";

function TeamSection({ title, icon, initialOpen = false, children }: { title: string; icon: ReactNode; initialOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  const id = useId(), reduced = useReducedMotion();
  return <section className={styles.section}>
    <button type="button" className={styles.sectionToggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{icon}<span>{title}</span><ChevronRight size={13} className={styles.chevron} data-open={open} /></button>
    <AnimatePresence initial={false}>{open && <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }} className={styles.sectionBody}><div>{children}</div></motion.div>}</AnimatePresence>
  </section>;
}

export function TeamContacts({ state, onBack }: { state: TeamWorkspace; onBack: () => void }) {
  const { modal } = App.useApp();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const unavailable = !state.available || state.busy;
  return <div className={styles.contacts} aria-label="团队通讯录">
    <button type="button" className={shell.navButton} onClick={onBack}><ArrowLeft size={15} /><span>返回工作区</span></button>
    {!state.available && <p className={styles.notice} role="status">请在 Yunfeng 桌面应用中使用团队功能。</p>}
    {!state.team ? <>
      <TeamSection title="创建本地团队" icon={<Users size={15} />} initialOpen><form className={styles.fields} onSubmit={(event) => { event.preventDefault(); if (!unavailable && name.trim() && owner.trim()) void state.create(name, owner); }}>
        <label>团队名称<Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="例如：研究小组" /></label>
        <label>你的名称<Input value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={80} placeholder="团队中显示的名称" /></label>
        <Button className={styles.createButton} htmlType="submit" type="primary" size="small" loading={state.busy} disabled={unavailable || !name.trim() || !owner.trim()}>创建团队</Button>
      </form></TeamSection>
      {!!state.snapshot?.savedTeams.length && <TeamSection title="本地团队" icon={<Users size={15} />} initialOpen>{state.snapshot.savedTeams.map((team) => <Button key={team.id} type="text" block disabled={unavailable} className={styles.savedTeam} onClick={() => void state.activate(team.id)}>{team.name}<ChevronRight size={13} /></Button>)}</TeamSection>}
    </> : <>
      <div className={styles.teamName}><span className={styles.avatar}><Users size={17} /></span><strong>{state.team.name}</strong><span className={styles.count}>{state.team.members.length}</span></div>
      {state.team.members.map((member) => <div key={member} className={styles.member}><span className={styles.memberDot} /><span>{member}</span><small>你</small></div>)}
      <div className={styles.actions}><Button type="text" size="small" disabled={unavailable} icon={<RotateCw size={14} />} onClick={() => void state.reload()}>刷新</Button>
        <Button type="text" size="small" disabled={unavailable} icon={<LogOut size={14} />} onClick={() => modal.confirm({ title: "关闭本地团队？", content: "消息和公告会保留，可以从本地团队列表恢复。", okText: "关闭团队", cancelText: "取消", onOk: async () => { if (!await state.leave()) throw new Error("关闭失败，请查看行内提示"); } })}>关闭团队</Button>
      </div>
    </>}
    <TeamSection title="配对与附近节点" icon={<Radio size={15} />}><p className={styles.hint}>独立节点已支持本机配对；桌面配对与局域网发现尚未接入。</p><Button size="small" disabled>加入远端团队</Button></TeamSection>
    {state.snapshot && <TeamSection title="本机安装标识" icon={<Fingerprint size={15} />}><p className={styles.identifier}>{state.snapshot.installationId}</p><p className={styles.hint}>此标识不用于配对认证。</p></TeamSection>}
  </div>;
}
