/* 组织图每次呈现一层直属关系；铭牌详情与视角切换分别操作。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Popover, Select } from "antd";
import { ArrowDownRight, Bot, Cpu, Network, UserRound, Workflow } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { Capsule } from "./Capsule";
import { kindLabels, robotLabels } from "./MemberEditor";
import { TeamMemberDetails } from "./TeamMemberDetails";
import { MemberStatus } from "./MemberStatus";
import styles from "./TeamMembers.module.css";
const icons = { human: UserRound, agent: Bot, program: Cpu, robot: Workflow };

function Nameplate({ member, state, edit, focus, root = false }: { member: MemberCard; state: TeamWorkspace; edit: (member: MemberCard) => void; focus: (id: string) => void; root?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const Icon = icons[member.profile.kind];
  const count = (state.relations ?? []).filter((edge) => edge.parentId === member.id).length;
  return <div className={styles.member} data-disabled={!member.profile.enabled} data-root={root}>
    <Popover open={open} onOpenChange={setOpen} destroyOnHidden trigger="click" placement="rightTop" content={<TeamMemberDetails key={member.id} member={member} state={state} edit={() => { setOpen(false); edit(member); }} close={close} />}>
      <button ref={trigger} type="button" className={styles.card} title={member.profile.name} aria-label={`查看成员：${member.profile.name}`} aria-expanded={open}>
        <span className={styles.avatar}><Icon size={16} /></span><span className={styles.copy}><strong>{member.profile.name}</strong><small>{member.profile.summary || (member.profile.robot ? robotLabels[member.profile.robot.kind] : kindLabels[member.profile.kind])}</small></span>
        <MemberStatus enabled={member.profile.enabled} presence={state.presence?.find((item) => item.memberId === member.id)} />
      </button>
    </Popover>
    {!root && <Button type="text" size="small" className={styles.focusButton} aria-label={`查看直属成员：${member.profile.name}`} title={`直属成员 ${count}`} icon={<ArrowDownRight size={13} />} onClick={() => focus(member.id)} />}
  </div>;
}

export function TeamOrganization({ state, edit }: { state: TeamWorkspace; edit: (member: MemberCard) => void }) {
  const [selected, setSelected] = useState("");
  const reduced = useReducedMotion();
  const members = state.participants ?? [], relations = state.relations ?? [];
  const current = members.find((member) => member.id === selected);
  const children = members.filter((member) => {
    const parent = relations.find((edge) => edge.memberId === member.id)?.parentId;
    return current ? parent === current.id : !parent;
  });
  const transition = { duration: reduced ? 0 : 0.16, ease: "easeOut" as const };
  return <section className={styles.organization} aria-label="直属成员关系图">
    <div className={styles.graphToolbar}>
      <Select virtual={false} aria-label="组织视角" size="small" variant="borderless" value={current?.id ?? ""} onChange={setSelected} popupMatchSelectWidth={230} showSearch optionFilterProp="label" options={[{ value: "", label: "独立成员" }, ...members.map((member) => ({ value: member.id, label: member.profile.name }))]} />
      <span className={styles.chips}><Capsule value={children.length}>{current ? "直属 " : "成员 "}{children.length}</Capsule></span>
    </div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={current?.id ?? "roots"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        {current ? <Nameplate member={current} root state={state} edit={edit} focus={setSelected} /> : <div className={styles.graphOrigin}><Network size={14} /><span>{state.team?.name ?? "团队"}</span></div>}
        <ul className={styles.branches} aria-label={current ? `${current.profile.name}的直属成员` : "独立成员"}>
          {children.map((member) => <li key={member.id}><Nameplate member={member} state={state} edit={edit} focus={setSelected} /></li>)}
        </ul>
        {!children.length && <p className={styles.graphEmpty}>{current ? "暂无直属成员" : "暂无独立成员"}</p>}
      </motion.div>
    </AnimatePresence>
  </section>;
}
