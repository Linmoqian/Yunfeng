/* 团队组织入口；仅保留界面选择，直属关系以 Rust 快照为准。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { MemberEditor } from "./MemberEditor";
import { TeamOrganization } from "./TeamOrganization";
import styles from "./TeamMembers.module.css";

export function TeamMemberList({ state }: { state: TeamWorkspace }) {
  const [editing, setEditing] = useState<MemberCard | null | undefined>();
  return <div className={styles.list} aria-label="团队成员">
    <div className={styles.heading}><span>组织关系</span><Button type="text" size="small" aria-label="添加成员" title="添加成员" disabled={!state.available || state.busy || !state.team} icon={<Plus size={14} />} onClick={() => setEditing(null)} /></div>
    <TeamOrganization state={state} edit={setEditing} />
    {!state.participants?.length && state.team?.members.map((name) => <span className={styles.legacy} key={name}>{name}</span>)}
    {editing !== undefined && <MemberEditor member={editing} save={state.saveMember} close={() => setEditing(undefined)} />}
  </div>;
}
