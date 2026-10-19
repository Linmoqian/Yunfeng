/* 相关节点胶囊：只展示模型建议，方向与余弦值按需查看。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import { Button, Popover } from "antd";
import { Network } from "lucide-react";
import type { NodeRelevance } from "../../../services/taskService";
import { researchGraphComponent } from "../../../services/researchGraphComponent";
import styles from "./ResearchRelevance.module.css";

export interface RelevanceControl { task: string; node: string; revision: number; names: Record<string, string>; inspect: (id: string) => void }
const labels = { progression: "递进", dependency: "依赖", abstraction: "抽象", related: "相关" };
const directions = { outgoing: "→", incoming: "←", undirected: "↔" };
export function ResearchRelevance({ value, control }: { value?: NodeRelevance; control: RelevanceControl }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.stopPropagation(); setOpen(false); trigger.current?.focus();
    };
    document.addEventListener("keydown", close, true);
    return () => document.removeEventListener("keydown", close, true);
  }, [open]);
  const analyze = async () => {
    setBusy(true); setError("");
    try { await researchGraphComponent(control.task, { component: "research-graph", action: "relate", node: control.node, revision: control.revision }); }
    catch { setError("暂无法分析，等待当前阶段完成后重试"); }
    finally { setBusy(false); }
  };
  return <Popover trigger="click" placement="top" open={open} onOpenChange={setOpen} content={<div className={styles.content}>
    <div className={styles.caption}>关系建议 · 非实测因果</div>
    {value?.status === "ready" ? value.matches.length ? value.matches.map((item) => <button key={item.target} className={styles.match} onClick={() => { setOpen(false); control.inspect(item.target); }}>
      <span className={styles.line}><span>{labels[item.relation]} {directions[item.direction]} {control.names[item.target] ?? item.target}</span><small title="余弦相似度，范围 -1 到 1；不是正确率">{item.similarity.toFixed(2)}</small></span>
      <span className={styles.reason}>{item.reason}</span>
    </button>) : <p className={styles.reason}>暂无明确相关节点</p> : <p className={styles.reason}>{value?.status === "unconfigured" ? "尚未配置 Embedding 模型" : value?.status === "unavailable" ? "模型暂不可用，请检查 Embedding 与决策模型配置" : "用词向量筛选，再判断语义关系"}</p>}
    {error && <p role="status" className={styles.reason}>{error}</p>}
    <Button size="small" type="text" loading={busy} disabled={busy} onClick={() => void analyze()}>分析相关性</Button>
  </div>}>
    <button ref={trigger} className={`${styles.trigger} nodrag nopan`} aria-label="节点相关性" aria-expanded={open}><Network size={12} />相关性{value?.status === "ready" && value.matches.length > 0 ? ` ${value.matches.length}` : ""}</button>
  </Popover>;
}
