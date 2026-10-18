/* 排队样例复用 Motion 排序；握柄拖动与键盘排序保留稳定消息身份。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { GripVertical, Trash2 } from "lucide-react";
import { Reorder, useDragControls, useIsPresent } from "motion/react";
import { interactionStyles, useGestureCancellation, useYunfengMotion } from "../../components/common";
import queueStyles from "../../features/workbench/components/QueuedMessages.module.css";
import styles from "./InteractionSamples.module.css";

export type SampleMessage = { id: number; text: string };
type Props = { item: SampleMessage; active: boolean; locked: boolean; begin: () => void; end: () => void; cancel: () => void; move: (direction: number) => void; remove: () => void };
export function QueueSampleRow({ item, active, locked, begin, end, cancel, move, remove }: Props) {
  const present = useIsPresent(), controls = useDragControls();
  const { reduced, transition } = useYunfengMotion();
  function abort() { controls.cancel(); cancel(); }
  useGestureCancellation(active, abort);
  return <Reorder.Item as="li" value={item} dragListener={false} dragControls={controls} dragMomentum={false}
    layout="position" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={transition("enter")} whileDrag={{ zIndex: 3, scale: reduced ? 1 : 1.015, boxShadow: "0 5px 12px #0000000c" }}
    onDragStart={begin} onDragEnd={end} aria-hidden={!present || undefined} inert={!present} className={styles.sortRow}>
    <div className={queueStyles.item}><button type="button" className={styles.sortHandle} disabled={locked} aria-label={`排序消息：${item.text}`} title="拖动排序，或按上下键"
      onPointerDown={(event) => { if (!locked && event.button === 0) { event.preventDefault(); event.currentTarget.focus(); controls.start(event); } }}
      onPointerCancel={abort} onKeyDown={(event) => { if (locked || active || !["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); move(event.key === "ArrowUp" ? -1 : 1); }}><GripVertical size={14} /></button>
      <span className={queueStyles.text} title={item.text}>{item.text}</span><button type="button" className={interactionStyles.pressable} disabled={locked || active} onClick={remove} aria-label={`移除消息：${item.text}`} title="移除"><Trash2 size={13} /></button></div>
  </Reorder.Item>;
}
