/* 组织图每次呈现一层直属关系；铭牌详情与视角切换分别操作。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Select } from "antd";
import { Network } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { MemberCard } from "../services/collaborationService";
import { useOrganizationDrag } from "../hooks/useOrganizationDrag";
import { Capsule } from "./Capsule";
import { DraggableMember } from "./DraggableMember";
import styles from "./TeamMembers.module.css";

export function TeamOrganization({ state, edit }: { state: TeamWorkspace; edit: (member: MemberCard) => void }) {
  const [selected, setSelected] = useState("");
  const reduced = useReducedMotion();
  const drag = useOrganizationDrag(state);
  const members = state.participants ?? [], relations = state.relations ?? [];
  const current = members.find((member) => member.id === selected);
  const children = members.filter((member) => {
    const parent = relations.find((edge) => edge.memberId === member.id)?.parentId;
    return current ? parent === current.id : !parent;
  });
  const transition = { duration: reduced ? 0 : 0.16, ease: "easeOut" as const };
  return <section ref={drag.scope} className={styles.organization} aria-label="直属成员关系图" data-dragging={!!drag.active}>
    <div className={styles.graphToolbar}>
      <Select virtual={false} aria-label="组织视角" size="small" variant="borderless" value={current?.id ?? ""} disabled={!!drag.active || drag.saving} onChange={setSelected} popupMatchSelectWidth={230} showSearch optionFilterProp="label" options={[{ value: "", label: "独立成员" }, ...members.map((member) => ({ value: member.id, label: member.profile.name }))]} />
      <span className={styles.chips}>{drag.active && drag.candidates.has("") ? <span className={styles.rootDrop} data-drop-member="" data-over={drag.target === ""}>独立成员</span> : <Capsule value={children.length}>{current ? "直属 " : "成员 "}{children.length}</Capsule>}</span>
    </div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={current?.id ?? "roots"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
        {current ? <DraggableMember member={current} root state={state} edit={edit} focus={setSelected} drag={drag} /> : <div className={styles.graphOrigin} data-drop-member="" data-candidate={!!drag.active && drag.candidates.has("")} data-over={drag.target === ""}><Network size={14} /><span>{drag.target === "" ? "设为独立成员" : state.team?.name ?? "团队"}</span></div>}
        <ul className={styles.branches} aria-label={current ? `${current.profile.name}的直属成员` : "独立成员"}>
          <AnimatePresence initial={false}>{children.map((member) => <motion.li layout="position" key={member.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={transition}><DraggableMember member={member} state={state} edit={edit} focus={setSelected} drag={drag} /></motion.li>)}</AnimatePresence>
        </ul>
        {!children.length && <p className={styles.graphEmpty}>{current ? "暂无直属成员" : "暂无独立成员"}</p>}
      </motion.div>
    </AnimatePresence>
    {drag.error && <p role="alert" className={styles.error}>{drag.error}</p>}
  </section>;
}
