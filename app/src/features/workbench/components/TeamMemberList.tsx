/* 通讯录身份铭牌；轻量摘要常驻，助手、权限和机器人资料按需展开。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Popover } from "antd";
import { Bot, Cpu, Pencil, Plus, UserRound, Workflow } from "lucide-react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { MemberEditor, kindLabels, accessLabels, robotLabels } from "./MemberEditor";
import { Capsule } from "./Capsule";
import styles from "./TeamMembers.module.css";
const icons = { human: UserRound, agent: Bot, program: Cpu, robot: Workflow };
function MemberDetails({ member }: { member: MemberCard }) {
  const p = member.profile;
  return <div className={styles.info}>
    <strong>{p.name}</strong><p>{p.summary || "暂无概述"}</p>
    <div className={styles.chips}><Capsule>{kindLabels[p.kind]}</Capsule><Capsule>{accessLabels[p.access]}</Capsule>{!p.enabled && <Capsule>已停用</Capsule>}</div>
    {p.assistant && <><dl><dt>模型</dt><dd>{p.assistant.model || "未登记"}</dd><dt>提供方</dt><dd>{p.assistant.provider || "未登记"}</dd></dl><div className={styles.chips}>{p.assistant.skills.map((skill) => <Capsule key={skill}>{skill}</Capsule>)}</div></>}
    {p.robot && <><dl><dt>设备</dt><dd>{robotLabels[p.robot.kind]}{p.robot.model ? ` · ${p.robot.model}` : ""}</dd><dt>控制授权</dt><dd>{p.robotControl ? "已允许" : "未授予"}</dd></dl><div className={styles.chips}>{p.robot.capabilities.map((capability) => <Capsule key={capability}>{capability}</Capsule>)}</div></>}
    <small>成员 {member.id.slice(0, 8)} · 节点 {member.nodeId.slice(0, 8)}</small>
  </div>;
}
export function TeamMemberList({ state }: { state: TeamWorkspace }) {
  const [editing, setEditing] = useState<MemberCard | null | undefined>();
  const participants = state.participants ?? [];
  return <div className={styles.list} aria-label="团队成员">
    <div className={styles.heading}><span>成员</span><Button type="text" size="small" aria-label="添加成员" title="添加成员" disabled={!state.available || state.busy || !state.team} icon={<Plus size={14} />} onClick={() => setEditing(null)} /></div>
    {participants.map((member) => { const Icon = icons[member.profile.kind]; const local = member.nodeId === state.snapshot?.installationId; return <div className={styles.member} key={member.id} data-disabled={!member.profile.enabled}>
      <Popover trigger="click" placement="rightTop" content={<MemberDetails member={member} />}><button type="button" className={styles.card} aria-label={`查看成员：${member.profile.name}`}><span className={styles.avatar}><Icon size={16} /></span><span className={styles.copy}><strong>{member.profile.name}</strong><small>{member.profile.summary || (member.profile.robot ? robotLabels[member.profile.robot.kind] : kindLabels[member.profile.kind])}</small></span><span className={styles.badges}><Capsule>{kindLabels[member.profile.kind]}</Capsule><Capsule>{member.profile.enabled ? accessLabels[member.profile.access] : "停用"}</Capsule></span></button></Popover>
      {local && <Button type="text" size="small" className={styles.editButton} aria-label={`编辑成员：${member.profile.name}`} title="编辑资料" disabled={state.busy} icon={<Pencil size={12} />} onClick={() => setEditing(member)} />}
    </div>; })}
    {!participants.length && state.team?.members.map((name) => <span className={styles.legacy} key={name}>{name}</span>)}
    {editing !== undefined && <MemberEditor member={editing} save={state.saveMember} close={() => setEditing(undefined)} />}
  </div>;
}
