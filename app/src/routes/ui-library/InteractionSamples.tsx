/* 可操作的模式、指标与消息队列样例，仅维护审阅页局部状态。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { Input, Segmented } from "antd";
import { Code2, FlaskConical, ListEnd, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { Capsule, interactionStyles, useYunfengMotion } from "../../components/common";
import modeStyles from "../../features/workbench/components/ConversationWelcome.module.css";
import queueStyles from "../../features/workbench/components/QueuedMessages.module.css";
import styles from "./InteractionSamples.module.css";

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

type Message = { id: number; text: string };
function SampleQueueRow({ item, remove }: { item: Message; remove: () => void }) {
  const present = useIsPresent();
  const { transition } = useYunfengMotion();
  return <motion.li initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition("enter")} aria-hidden={!present || undefined} inert={!present}>
    <div className={queueStyles.item}><ListEnd size={14} aria-hidden="true" /><span className={queueStyles.text} title={item.text}>{item.text}</span><button type="button" className={interactionStyles.pressable} onClick={remove} aria-label={`移除消息：${item.text}`} title="移除"><Trash2 size={13} /></button></div>
  </motion.li>;
}

function QueueReveal({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const { transition } = useYunfengMotion();
  return <motion.div className={queueStyles.reveal} aria-hidden={!present || undefined} inert={!present} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition("enter")}>{children}</motion.div>;
}

export function QueueSample() {
  const [items, setItems] = useState<Message[]>([]), [draft, setDraft] = useState("");
  const sequence = useRef(0), input = useRef<import("antd").InputRef>(null);
  function add(text: string) {
    if (items.length >= 3 || !text.trim()) return;
    const item = { id: ++sequence.current, text: text.trim() };
    setItems((value) => value.length >= 3 ? value : [...value, item]); setDraft("");
  }
  return <div className={styles.queueSample}>
    <div className={styles.actions}><button type="button" className={interactionStyles.pressable} disabled={items.length >= 3} onClick={() => add(`核对实验记录 ${sequence.current + 1}`)}><Plus size={13} />添加样例</button><button type="button" className={interactionStyles.pressable} disabled={!items.length} onClick={() => setItems([])}>清空</button><span role="status">{items.length}/3 条 · 样例</span></div>
    <div className={styles.queueStage}><AnimatePresence initial={false}>{items.length > 0 && <QueueReveal key="queue">
      <div className={queueStyles.queue}><ul aria-label="样例排队消息"><AnimatePresence initial={false}>{items.map((item) => <SampleQueueRow key={item.id} item={item} remove={() => { setItems((value) => value.filter((entry) => entry.id !== item.id)); input.current?.focus(); }} />)}</AnimatePresence></ul></div>
    </QueueReveal>}</AnimatePresence>
      <Input ref={input} value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} aria-label="样例排队消息内容" placeholder={items.length >= 3 ? "队列已满，可先移除消息" : "输入消息，Enter 排队"} onPressEnter={(event) => { if (!event.nativeEvent.isComposing && event.keyCode !== 229) add(draft); }} />
    </div>
  </div>;
}
