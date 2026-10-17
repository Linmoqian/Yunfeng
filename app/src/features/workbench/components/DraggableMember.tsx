/* 铭牌拖动：浮起、原位虚影、候选吸附与取消回位；复用 Motion 和关系接口。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { GripVertical } from "lucide-react";
import { animate, motion, useDragControls, useMotionValue, type PanInfo } from "motion/react";
import { useRef } from "react";
import { useGestureCancellation } from "../../../components/common/interaction/useGestureCancellation";
import { useYunfengMotion } from "../../../components/common/motion/useYunfengMotion";
import type { TeamWorkspace } from "../hooks/useTeamWorkspace";
import type { OrganizationDrag } from "../hooks/useOrganizationDrag";
import type { MemberCard } from "../services/collaborationService";
import { TeamNameplate } from "./TeamNameplate";
import styles from "./TeamMembers.module.css";

type Props = { member: MemberCard; state: TeamWorkspace; drag: OrganizationDrag; edit: (member: MemberCard) => void; focus: (id: string) => void; root?: boolean };
export function DraggableMember({ member, state, drag, ...props }: Props) {
  const controls = useDragControls(), x = useMotionValue(0), y = useMotionValue(0);
  const slot = useRef<HTMLDivElement>(null), cancelled = useRef(false);
  const pressed = useRef<{ x: number; y: number } | null>(null), started = useRef(false);
  const { reduced, transition } = useYunfengMotion();
  const active = drag.active === member.id;
  const local = member.nodeId === state.snapshot?.installationId;
  const locked = !state.available || state.busy || drag.saving;
  function reset() {
    void animate(x, 0, transition("return"));
    void animate(y, 0, transition("return"));
  }
  useGestureCancellation(active, () => { cancelled.current = true; controls.cancel(); drag.cancel(); reset(); });
  async function end(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (cancelled.current) { reset(); return; }
    const target = drag.locate(info.point);
    const destination = target?.dataset.dropMember;
    if (!target || destination === undefined || !slot.current) { drag.cancel(); reset(); return; }
    const from = slot.current.getBoundingClientRect(), to = target.getBoundingClientRect();
    await Promise.all([
      animate(x, to.left - from.left, transition("snap")),
      animate(y, to.bottom - from.top - 12, transition("snap")),
    ]);
    if (!cancelled.current) await drag.commit(destination);
    reset();
  }
  return <div ref={slot} className={styles.dragSlot} data-drop-member={member.id} data-source={active} data-candidate={drag.candidates.has(member.id)} data-over={drag.target === member.id}>
    <motion.div className={styles.dragMember} style={{ x, y, zIndex: active ? 5 : undefined, pointerEvents: active ? "none" : undefined }}
      drag={!locked && local} dragControls={controls} dragListener={false} dragMomentum={false}
      animate={{ scale: active && !reduced ? 1.025 : 1, rotate: active && !reduced ? -0.6 : 0 }}
      transition={transition("lift")} onDragStart={() => { started.current = true; }}
      onDrag={(_event, info) => { if (!cancelled.current) drag.locate(info.point); }} onDragEnd={(event, info) => void end(event, info)}>
      <TeamNameplate {...props} member={member} state={state} dragging={active} handle={local && <span className={styles.dragHandle} aria-hidden="true" title="拖动调整直属关系" data-locked={locked}
        onPointerDown={(event) => { if (!locked && event.button === 0 && drag.begin(member)) { event.preventDefault(); cancelled.current = false; started.current = false; pressed.current = { x: event.pageX, y: event.pageY }; event.currentTarget.setPointerCapture(event.pointerId); controls.start(event); } }}
        onPointerCancel={() => { cancelled.current = true; controls.cancel(); drag.cancel(); reset(); }}
        onPointerUp={(event) => {
          const origin = pressed.current; pressed.current = null;
          // 极快的指针拖放可能先于 Motion 的首帧结束，仍按真实释放位置提交。
          if (!origin || started.current || cancelled.current) return;
          controls.cancel();
          if (Math.hypot(event.pageX - origin.x, event.pageY - origin.y) < 4) { drag.cancel(); reset(); return; }
          x.set(event.pageX - origin.x); y.set(event.pageY - origin.y);
          void end(event.nativeEvent, { point: { x: event.pageX, y: event.pageY } } as PanInfo);
        }}><GripVertical size={12} /></span>} />
    </motion.div>
    {drag.target === member.id && <span className={styles.dropPreview} aria-hidden="true">放入直属成员</span>}
  </div>;
}
