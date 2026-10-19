/* 团队铭牌保留点击详情，并由组织图提供独立拖动把手。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Popover } from "antd";
import { ArrowDownRight, Bot, Cpu, UserRound, Workflow } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { kindLabels, robotLabels } from "./MemberEditor";
import { TeamMemberDetails } from "./TeamMemberDetails";
import { MemberStatus } from "./MemberStatus";
import styles from "./TeamMembers.module.css";
const icons = { human: UserRound, agent: Bot, program: Cpu, robot: Workflow };

export function TeamNameplate({ member, state, edit, focus, root = false, handle, dragging = false }: { member: MemberCard; state: TeamWorkspace; edit: (member: MemberCard) => void; focus: (id: string) => void; root?: boolean; handle?: ReactNode; dragging?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const Icon = icons[member.profile.kind];
  const count = (state.relations ?? []).filter((edge) => edge.parentId === member.id).length;
  return <div className={styles.member} data-disabled={!member.profile.enabled} data-root={root}>
    {handle}
    <Popover open={open && !dragging} onOpenChange={setOpen} destroyOnHidden trigger="click" placement="rightTop" content={<TeamMemberDetails key={member.id} member={member} state={state} edit={() => { setOpen(false); edit(member); }} close={close} />}>
      <button ref={trigger} type="button" className={styles.card} title={member.profile.name} aria-label={`查看成员：${member.profile.name}`} aria-expanded={open}>
        <span className={styles.avatar}><Icon size={16} /></span><span className={styles.copy}><strong>{member.profile.name}</strong><small>{member.profile.summary || (member.profile.robot ? robotLabels[member.profile.robot.kind] : kindLabels[member.profile.kind])}</small></span>
        <MemberStatus enabled={member.profile.enabled} presence={state.presence?.find((item) => item.memberId === member.id)} />
      </button>
    </Popover>
    {!root && <Button type="text" size="small" className={styles.focusButton} aria-label={`查看直属成员：${member.profile.name}`} title={`直属成员 ${count}`} icon={<ArrowDownRight size={13} />} onClick={() => focus(member.id)} />}
  </div>;
}
