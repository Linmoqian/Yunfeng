/* 可操作的模式、指标与消息队列样例，仅维护审阅页局部状态。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { Input, Segmented } from "antd";
import { Code2, FlaskConical, Plus } from "lucide-react";
import { AnimatePresence, motion, Reorder, useIsPresent } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { Capsule, interactionStyles, useYunfengMotion } from "../../components/common";
import modeStyles from "../../features/workbench/components/ConversationWelcome.module.css";
import queueStyles from "../../features/workbench/components/QueuedMessages.module.css";
import styles from "./InteractionSamples.module.css";
import { QueueSampleRow, type SampleMessage } from "./QueueSampleRow";

export function ModeSample() {
  const [mode, setMode] = useState("development"), [keyboard, setKeyboard] = useState(false);
  const { reduced, transition } = useYunfengMotion();
  const instant = reduced || keyboard;
  return <>
    <Segmented className={modeStyles.modeSelector} data-instant={instant || undefined} aria-label="样例工作模式" value={mode} onChange={setMode}
      onPointerDownCapture={() => setKeyboard(false)} onKeyDownCapture={() => setKeyboard(true)}
      options={[{ value: "development", label: <div className={modeStyles.modeLabel}><Code2 size={15} />开发</div> }, { value: "research", label: <div className={modeStyles.modeLabel}><FlaskConical size={15} />科研</div> }]} />
    <div className={styles.description} aria-live="polite">{[["development", "编写代码、排查问题。"], ["research", "观察、实验并积累结论。"]].map(([value, text]) => <motion.span key={value} aria-hidden={mode !== value} initial={false} animate={{ opacity: mode === value ? 1 : 0 }} transition={instant ? { duration: 0 } : transition("enter")}>{text}</motion.span>)}</div>
  </>;
}

const metrics = [{ gain: "8.2", status: "待复核" }, { gain: "14.4", status: "验收通过" }, { gain: "17.1", status: "验收通过" }];
export function CapsuleSample() {
  const [index, setIndex] = useState(0);
  const metric = metrics[index];
  return <><div className={styles.row} role="status"><Capsule tone="accent" value={metric.gain}>提升 {metric.gain}%</Capsule><Capsule tone={index ? "success" : "warning"} value={metric.status}>{metric.status}</Capsule></div>
    <div className={styles.actions}><button type="button" className={interactionStyles.pressable} onClick={() => setIndex((value) => (value + 1) % metrics.length)}>更新指标</button><span>样例数据</span></div></>;
}

function QueueReveal({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const { transition } = useYunfengMotion();
  return <motion.div className={queueStyles.reveal} aria-hidden={!present || undefined} inert={!present} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition("enter")}>{children}</motion.div>;
}

export function QueueSample() {
  const [items, setItems] = useState<SampleMessage[]>([]), [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const previous = useRef<SampleMessage[]>([]);
  const sequence = useRef(0), input = useRef<import("antd").InputRef>(null);
  function add(text: string) {
    if (dragging !== null || items.length >= 3 || !text.trim()) return;
    const item = { id: ++sequence.current, text: text.trim() };
    setItems((value) => value.length >= 3 ? value : [...value, item]); setDraft("");
  }
  return <div className={styles.queueSample}>
    <div className={styles.actions}><button type="button" className={interactionStyles.pressable} disabled={dragging !== null || items.length >= 3} onClick={() => add(`核对实验记录 ${sequence.current + 1}`)}><Plus size={13} />添加样例</button><button type="button" className={interactionStyles.pressable} disabled={dragging !== null || !items.length} onClick={() => setItems([])}>清空</button><span role="status">{items.length}/3 条 · 样例</span></div>
    <div className={styles.queueStage}><AnimatePresence initial={false}>{items.length > 0 && <QueueReveal key="queue">
      <div className={queueStyles.queue}><Reorder.Group axis="y" values={items} onReorder={setItems} aria-label="样例排队消息"><AnimatePresence initial={false}>{items.map((item) => <QueueSampleRow key={item.id} item={item} active={dragging === item.id} locked={dragging !== null && dragging !== item.id}
        begin={() => { previous.current = items; setDragging(item.id); }} end={() => setDragging(null)} cancel={() => { if (dragging !== item.id) return; setItems(previous.current); setDragging(null); }}
        move={(direction) => setItems((value) => { const from = value.findIndex((entry) => entry.id === item.id), to = Math.max(0, Math.min(value.length - 1, from + direction)); const next = [...value]; next.splice(to, 0, ...next.splice(from, 1)); return next; })}
        remove={() => { setItems((value) => value.filter((entry) => entry.id !== item.id)); input.current?.focus(); }} />)}</AnimatePresence></Reorder.Group></div>
    </QueueReveal>}</AnimatePresence>
      <Input ref={input} value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} aria-label="样例排队消息内容" placeholder={items.length >= 3 ? "队列已满，可先移除消息" : "输入消息，Enter 排队"} onPressEnter={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229) add(draft); }} />
    </div>
  </div>;
}
