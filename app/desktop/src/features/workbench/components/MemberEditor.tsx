/* 成员铭牌编辑；权限由 Rust 保存，设备资料不表示已经连接真实机器人。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Input, Modal, Select, Switch } from "antd";
import { useRef, useState } from "react";
import type { MemberCard, MemberKind, MemberProfile } from "../services/collaborationService";
import styles from "./TeamMembers.module.css";
export const kindLabels = { human: "人类", agent: "Agent", program: "程序", robot: "机器人" };
export const accessLabels = { observer: "只读", contributor: "协作", editor: "维护" };
export const robotLabels = { vehicle: "车辆", drone: "无人机", arm: "机械臂", other: "其他设备" };
const blank: MemberProfile = { name: "", kind: "human", access: "observer", summary: "", enabled: true, robotControl: false, assistant: null, robot: null };
const commandHints = { vehicle: "drive", drone: "takeoff, land, velocity", arm: "joints, gripper", other: "设备适配器支持的指令" };
const tags = (text: string) => [...new Set(text.split(/[,，]/).map((v) => v.trim()).filter(Boolean))];
export function MemberEditor({ member, save, close }: { member: MemberCard | null; save: (id: string, profile: MemberProfile) => Promise<boolean>; close: () => void }) {
  const [profile, setProfile] = useState<MemberProfile>(() => structuredClone(member?.profile ?? blank));
  const [id] = useState(() => member?.id ?? crypto.randomUUID());
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const [skills, setSkills] = useState(member?.profile.assistant?.skills.join(", ") ?? "");
  const [capabilities, setCapabilities] = useState(member?.profile.robot?.capabilities.join(", ") ?? "");
  const changeKind = (kind: MemberKind) => setProfile((p) => ({ ...p, kind, robotControl: false, assistant: kind === "agent" ? { model: "", provider: "", skills: [] } : null, robot: kind === "robot" ? { kind: "vehicle", model: "", capabilities: [] } : null }));
  async function submit() {
    if (inFlight.current || !profile.name.trim()) return;
    inFlight.current = true;
    setSaving(true); setFailed(false);
    const next = { ...profile, name: profile.name.trim(), assistant: profile.assistant ? { ...profile.assistant, skills: tags(skills) } : null, robot: profile.robot ? { ...profile.robot, capabilities: tags(capabilities) } : null };
    try { if (await save(id, next)) close(); else setFailed(true); }
    catch { setFailed(true); } finally { inFlight.current = false; setSaving(false); }
  }
  return <Modal open title={member ? "成员资料" : "添加成员"} width={420} onCancel={saving ? undefined : close} mask={{ closable: !saving }} keyboard={!saving} closable={!saving} footer={null}>
    <form className={styles.editor} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label>名称<Input autoFocus aria-label="成员名称" maxLength={80} value={profile.name} disabled={saving} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
      <div className={styles.row}><label>身份<Select aria-label="成员身份" value={profile.kind} disabled={saving} onChange={changeKind} options={Object.entries(kindLabels).map(([value, label]) => ({ value, label }))} /></label><label>权限<Select aria-label="成员权限" value={profile.access} disabled={saving} onChange={(access) => setProfile({ ...profile, access })} options={Object.entries(accessLabels).map(([value, label]) => ({ value, label }))} /></label></div>
      <p className={styles.hint}>{profile.access === "observer" ? "查看团队资料。" : profile.access === "contributor" ? "查看、发消息与共享文件。" : "查看、发消息、共享文件与编辑公告。"}</p>
      <label>概述<Input.TextArea aria-label="成员概述" autoSize={{ minRows: 2, maxRows: 3 }} maxLength={240} value={profile.summary} disabled={saving} onChange={(e) => setProfile({ ...profile, summary: e.target.value.replace(/[\r\n]/g, " ") })} /></label>
      {profile.assistant && <div className={styles.details}><div className={styles.row}><label>模型<Input aria-label="助手模型" maxLength={80} value={profile.assistant.model} disabled={saving} onChange={(e) => setProfile({ ...profile, assistant: { ...profile.assistant!, model: e.target.value } })} /></label><label>提供方<Input aria-label="助手提供方" maxLength={80} value={profile.assistant.provider} disabled={saving} onChange={(e) => setProfile({ ...profile, assistant: { ...profile.assistant!, provider: e.target.value } })} /></label></div><label>技能<Input aria-label="助手技能" placeholder="逗号分隔，最多 16 项" value={skills} disabled={saving} onChange={(e) => setSkills(e.target.value)} /></label></div>}
      {profile.robot && <div className={styles.details}><div className={styles.row}><label>设备类型<Select aria-label="机器人类型" value={profile.robot.kind} disabled={saving} onChange={(kind) => { setCapabilities(""); setProfile({ ...profile, robot: { ...profile.robot!, kind, capabilities: [] } }); }} options={Object.entries(robotLabels).map(([value, label]) => ({ value, label }))} /></label><label>型号<Input aria-label="机器人型号" maxLength={80} value={profile.robot.model} disabled={saving} onChange={(e) => setProfile({ ...profile, robot: { ...profile.robot!, model: e.target.value } })} /></label></div><label>指令能力<Input aria-label="机器人指令能力" placeholder={commandHints[profile.robot.kind]} value={capabilities} disabled={saving} onChange={(e) => setCapabilities(e.target.value)} /></label><label className={styles.switch}>允许设备控制<Switch aria-label="允许设备控制" size="small" checked={profile.robotControl} disabled={saving} onChange={(robotControl) => setProfile({ ...profile, robotControl })} /></label><p className={styles.hint}>这里只登记资料和授权，真实动作需要硬件适配器。</p></div>}
      <label className={styles.switch}>启用成员<Switch aria-label="启用成员" size="small" checked={profile.enabled} disabled={saving} onChange={(enabled) => setProfile({ ...profile, enabled })} /></label>
      {failed && <p role="alert" className={styles.error}>保存未完成，草稿已保留。请检查资料后重试。</p>}
      <div className={styles.actions}><Button type="text" size="small" disabled={saving} onClick={close}>取消</Button><Button type="primary" size="small" htmlType="submit" aria-label="保存成员" loading={saving} disabled={!profile.name.trim()}>保存</Button></div>
    </form>
  </Modal>;
}
