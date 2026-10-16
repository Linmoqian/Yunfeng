/* 开发会话的服务端队列条，按事件刷新，不维护第二份待发送队列。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { ListEnd, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { sendTaskCommand } from "../../../services/taskService";
import { SESSION_ENTER } from "../workspaceMotion";
import styles from "./QueuedMessages.module.css";

type Queue = { steering: string[]; followUp: string[] };
const empty: Queue = { steering: [], followUp: [] };
type QueueItem = { id: string; text: string; label: string };

// 服务端仅返回字符串；按内容和同类重复次数保持渲染身份，不使用会随出队变化的索引。
function queueItems(queue: Queue): QueueItem[] {
  const seen = new Map<string, number>();
  return [...queue.steering.map((text) => ({ text, label: "引导" })), ...queue.followUp.map((text) => ({ text, label: "排队" }))].map((item) => {
    const key = JSON.stringify([item.label, item.text]);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { ...item, id: JSON.stringify([key, occurrence]) };
  });
}

function QueueRow({ item }: { item: QueueItem }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return <motion.li initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={{ ...SESSION_ENTER, duration: reduced ? 0 : 0.14 }} aria-hidden={!present || undefined}>
    <div className={styles.item}><ListEnd size={14} aria-hidden="true" /><span className={styles.text} title={item.text}>{item.text}</span><span className={styles.label}>{item.label}</span></div>
  </motion.li>;
}

function QueuePanel({ items, error, busy, onClear, onRetry }: { items: QueueItem[]; error: string | null; busy: boolean; onClear: () => void; onRetry: () => void }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  return <motion.section className={styles.reveal} aria-label="等待处理的消息" aria-hidden={!present || undefined} inert={!present}
    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
    transition={{ ...SESSION_ENTER, duration: reduced ? 0 : 0.16 }}>
    <div className={styles.queue}>
      <div className={styles.header}><span>{items.length ? `${items.length} 条待处理` : "排队消息"}</span>
        {items.length > 0 && <Button type="text" size="small" icon={<Trash2 size={13} />} disabled={busy} onClick={onClear} aria-label="清空所有排队消息" title="清空所有排队消息" />}
      </div>
      {error && <div className={styles.error} role="alert">{error}<Button type="link" size="small" onClick={onRetry}>重试</Button></div>}
      <ul><AnimatePresence initial={false}>{items.map((item) => <QueueRow key={item.id} item={item} />)}</AnimatePresence></ul>
    </div>
  </motion.section>;
}

export function QueuedMessages({ taskId, revision }: { taskId: string; revision: string }) {
  const [queue, setQueue] = useState<Queue>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let disposed = false;
    void sendTaskCommand(taskId, { type: "getQueue" }).then((value) => {
      if (disposed) return;
      const data = value as Partial<Queue> | undefined;
      setQueue({ steering: Array.isArray(data?.steering) ? data.steering.filter((item) => typeof item === "string") : [], followUp: Array.isArray(data?.followUp) ? data.followUp.filter((item) => typeof item === "string") : [] });
      setError(null);
    }).catch(() => { if (!disposed) setError("排队状态读取失败"); });
    return () => { disposed = true; };
  }, [taskId, revision, reload]);
  async function clear() {
    setBusy(true);
    try { await sendTaskCommand(taskId, { type: "clearQueue" }); setReload((value) => value + 1); }
    catch { setError("清空失败，请重试"); }
    finally { setBusy(false); }
  }
  const items = queueItems(queue);
  return <AnimatePresence initial={false}>{(items.length > 0 || error) && <QueuePanel key={taskId} items={items} error={error} busy={busy}
    onClear={() => void clear()} onRetry={() => setReload((value) => value + 1)} />}</AnimatePresence>;
}
