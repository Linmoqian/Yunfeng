/* UI 审阅页的本地拖放沙盒，复用共享反馈和动效，不修改团队关系。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { GripVertical } from "lucide-react";
import { dragStyles, useGestureCancellation, useYunfengMotion } from "../../components/common";
import styles from "./DragPlayground.module.css";

const names = ["起点", "候选一", "候选二"];
export function DragPlayground() {
  const area = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const gesture = useRef<{ id: number; left: number; top: number; x: number; y: number } | null>(null);
  const [position, setPosition] = useState(0), [active, setActive] = useState(false);
  const [over, setOver] = useState<number | null>(null), [settling, setSettling] = useState(false);
  const generation = useRef(0);
  const x = useMotionValue(0), y = useMotionValue(0);
  const { reduced, transition } = useYunfengMotion();
  function offset(index: number) {
    const origin = slots.current[0]?.getBoundingClientRect(), target = slots.current[index]?.getBoundingClientRect();
    return { x: origin && target ? target.left - origin.left : 0, y: origin && target ? target.top - origin.top : 0 };
  }
  async function finish(destination: number) {
    const version = ++generation.current;
    gesture.current = null; setActive(false); setOver(null); setSettling(true);
    const next = offset(destination);
    await Promise.all([animate(x, next.x, transition(destination === position ? "return" : "snap")), animate(y, next.y, transition("snap"))]);
    if (version !== generation.current) return;
    setPosition(destination); setSettling(false);
  }
  useGestureCancellation(active, () => void finish(position));
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (gesture.current || settling) return;
      const next = offset(position); x.set(next.x); y.set(next.y);
    });
    if (area.current) observer.observe(area.current);
    return () => observer.disconnect();
  }, [position, settling, x, y]);
  useEffect(() => () => { generation.current++; x.stop(); y.stop(); }, [x, y]);
  function locate(left: number, top: number) {
    const index = slots.current.findIndex((slot) => { const box = slot?.getBoundingClientRect(); return box && left >= box.left && left <= box.right && top >= box.top && top <= box.bottom; });
    return index < 0 ? null : index;
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || settling) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, left: event.clientX, top: event.clientY, x: x.get(), y: y.get() };
    setActive(true); setOver(position);
  }
  return <>
    <div ref={area} className={styles.area} data-active={active}>
      {names.map((name, index) => <div key={name} className={styles.column}><small>{name}</small><div ref={(node) => { slots.current[index] = node; }} className={`${styles.slot} ${dragStyles.slot} ${dragStyles.target}`} data-source={active && position === index} data-candidate={active && position !== index} data-over={over === index}>
        {index !== position && <span className={styles.placeholder}>放到这里</span>}
        {over === index && active && <span className={dragStyles.hint}>松开吸附</span>}
      </div></div>)}
      <motion.div role="button" tabIndex={0} aria-label="拖动成员铭牌" aria-describedby="drag-help" aria-disabled={settling}
        className={`${styles.card} ${dragStyles.floating}`} style={{ x, y }}
        animate={{ scale: active && !reduced ? 1.025 : 1, rotate: active && !reduced ? -0.6 : 0 }} transition={transition("lift")}
        onPointerDown={begin} onPointerMove={(event) => { const start = gesture.current; if (!start || start.id !== event.pointerId) return; x.set(start.x + event.clientX - start.left); y.set(start.y + event.clientY - start.top); setOver(locate(event.clientX, event.clientY)); }}
        onPointerUp={(event) => { if (gesture.current?.id === event.pointerId) void finish(locate(event.clientX, event.clientY) ?? position); }}
        onPointerCancel={() => { if (gesture.current) void finish(position); }}
        onLostPointerCapture={() => { if (gesture.current) void finish(position); }}
        onKeyDown={(event) => { if (active || settling || !["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); void finish(Math.max(0, Math.min(2, position + (event.key === "ArrowRight" ? 1 : -1)))); }}>
        <GripVertical size={13} aria-hidden="true" />成员铭牌
      </motion.div>
    </div>
    <p id="drag-help">拖动铭牌到候选位置，松开吸附；移出后松开或按 Esc 回位。也可聚焦后按左右键。</p>
    <span className={styles.status} role="status">{active ? "拖动中" : settling ? "正在吸附" : `当前：${names[position]}`} · 本地样例</span>
  </>;
}
