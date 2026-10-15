/* 开发会话的服务端队列条，按事件刷新，不维护第二份待发送队列。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Button } from "antd";
import { ListEnd, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { sendTaskCommand } from "../../../services/taskService";
import styles from "./QueuedMessages.module.css";

type Queue = { steering: string[]; followUp: string[] };
const empty: Queue = { steering: [], followUp: [] };

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
  const items = [...queue.steering.map((text) => ({ text, label: "引导" })), ...queue.followUp.map((text) => ({ text, label: "排队" }))];
  if (!items.length && !error) return null;
  return <section className={styles.queue} aria-label="等待处理的消息">
    <div className={styles.header}><span>{items.length ? `${items.length} 条待处理` : "排队消息"}</span>
      {items.length > 0 && <Button type="text" size="small" icon={<Trash2 size={13} />} disabled={busy} onClick={() => void clear()} aria-label="清空所有排队消息" title="清空所有排队消息" />}
    </div>
    {error && <div className={styles.error} role="alert">{error}<Button type="link" size="small" onClick={() => setReload((value) => value + 1)}>重试</Button></div>}
    <ul>{items.map((item, index) => <li key={`${item.label}-${index}`}><ListEnd size={14} aria-hidden="true" /><span className={styles.text} title={item.text}>{item.text}</span><span className={styles.label}>{item.label}</span></li>)}</ul>
  </section>;
}
