/* 铭牌详情复用身份资料；直属关系显式保存并保留失败草稿。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Select } from "antd";
import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { kindLabels, accessLabels, robotLabels } from "./MemberEditor";
import { Capsule } from "./Capsule";
import styles from "./TeamMembers.module.css";

function RelationEditor({ member, state }: { member: MemberCard; state: TeamWorkspace }) {
  const parent = (state.relations ?? []).find((edge) => edge.memberId === member.id)?.parentId ?? "";
  const [draft, setDraft] = useState(parent);
  const [saving, setSaving] = useState(false), [feedback, setFeedback] = useState("");
  const pending = useRef(false);
  useEffect(() => { setDraft(parent); }, [parent]);
  const excluded = new Set([member.id]);
  for (let size = 0; size !== excluded.size;) {
    size = excluded.size;
    for (const edge of state.relations ?? []) if (edge.parentId && excluded.has(edge.parentId)) excluded.add(edge.memberId);
  }
  async function save() {
    if (pending.current || draft === parent) return;
    pending.current = true; setSaving(true); setFeedback("");
    try { setFeedback(await state.saveRelation(member.id, draft || null) ? "已保存" : "保存失败，选择已保留，请重试。"); }
    catch { setFeedback("保存失败，选择已保留，请重试。"); }
    finally { pending.current = false; setSaving(false); }
  }
  const locked = !state.available || state.busy || saving;
  return <div className={styles.relationEditor}>
    <label>直属上级</label><div className={styles.relationControls}>
      <Select virtual={false} aria-label="直属上级" size="small" value={draft} disabled={locked} showSearch optionFilterProp="label" getPopupContainer={(trigger) => trigger.parentElement ?? trigger} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }} options={[{ value: "", label: "独立成员" }, ...(state.participants ?? []).filter((candidate) => !excluded.has(candidate.id)).map((candidate) => ({ value: candidate.id, label: candidate.profile.name }))]} onChange={(id) => { setDraft(id); setFeedback(""); }} />
      <Button type="text" size="small" aria-label="保存直属关系" title="保存直属关系" icon={<Check size={14} />} loading={saving} disabled={locked || draft === parent} onClick={() => void save()} />
    </div>
    {feedback && <p className={feedback === "已保存" ? styles.saved : styles.error} role={feedback === "已保存" ? "status" : "alert"}>{feedback}</p>}
  </div>;
}

export function TeamMemberDetails({ member, state, edit, close }: { member: MemberCard; state: TeamWorkspace; edit: () => void; close: () => void }) {
  const p = member.profile;
  const local = member.nodeId === state.snapshot?.installationId;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  return <div ref={panel} tabIndex={-1} role="dialog" aria-label={`成员详情：${p.name}`} className={styles.info} onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); close(); } }}>
    <div className={styles.detailHeading}><strong>{p.name}</strong>{local && <Button type="text" size="small" aria-label={`编辑成员：${p.name}`} title="编辑资料" disabled={state.busy || !state.available} icon={<Pencil size={12} />} onClick={edit} />}<Button type="text" size="small" aria-label="关闭成员详情" title="关闭" icon={<X size={12} />} onClick={close} /></div>
    {p.summary && <p>{p.summary}</p>}
    <div className={styles.chips}><Capsule>{kindLabels[p.kind]}</Capsule><Capsule>{accessLabels[p.access]}</Capsule>{!p.enabled && <Capsule>已停用</Capsule>}</div>
    {p.assistant && <><dl><dt>模型</dt><dd>{p.assistant.model || "未登记"}</dd><dt>提供方</dt><dd>{p.assistant.provider || "未登记"}</dd></dl><div className={styles.chips}>{p.assistant.skills.map((skill) => <Capsule key={skill}>{skill}</Capsule>)}</div></>}
    {p.robot && <><dl><dt>设备</dt><dd>{robotLabels[p.robot.kind]}{p.robot.model ? ` · ${p.robot.model}` : ""}</dd><dt>控制授权</dt><dd>{p.robotControl ? "已允许" : "未授予"}</dd></dl><div className={styles.chips}>{p.robot.capabilities.map((capability) => <Capsule key={capability}>{capability}</Capsule>)}</div></>}
    {local ? <RelationEditor member={member} state={state} /> : <p className={styles.remote}>直属关系由所属节点管理</p>}
  </div>;
}
