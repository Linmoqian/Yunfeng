/* 科研任务阶段与暂停恢复控制，以服务端检查点为准。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { Button, Popover } from "antd";
import { Ellipsis, Pause, Play } from "lucide-react";
import { sendTaskCommand, type TaskState } from "../../../services/taskService";
import { researchProgress } from "../researchPresentation";
import { ProgressCapsule } from "./ProgressCapsule";
import { ResearchReport } from "./ResearchReport";
import { Capsule } from "./Capsule";
import styles from "./ResearchRuntimeCard.module.css";
const labels = { OBSERVING: "查看进展", PLANNING: "分析中", EXECUTING: "实验中", WAITING: "等待中", REFLECTING: "整理结果", PAUSED: "已暂停", COMPLETED: "已完成", FAILED: "需要处理" };
export function ResearchRuntimeCard({ task }: { task: TaskState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = task.autonomy;
  if (!state) return null;
  const paused = state.phase === "PAUSED" || state.phase === "FAILED";
  const nodes = state.decision?.nodes.filter((node) => node.kind !== "group") ?? [];
  async function control() {
    setBusy(true); setError(null);
    try { await sendTaskCommand(task.id, { type: paused ? "retry" : "abort" }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <aside className={styles.card} aria-label="科研自主任务">
    <Capsule className={styles.line} value={state.phase}><strong aria-live="polite">科研 · {labels[state.phase]}</strong>
      {state.phase !== "COMPLETED" && <Button size="small" loading={busy} onClick={() => void control()} icon={paused ? <Play size={14} /> : <Pause size={14} />}>{paused ? "继续" : "暂停"}</Button>}
      <Popover trigger="click" title="运行详情" content={<div className={styles.details}><p>第 {state.cycle} / {state.maxCycles} 轮</p><p>{state.reason}</p><small>{task.cwd}</small></div>}>
        <Button type="text" size="small" aria-label="运行详情" title="运行详情" icon={<Ellipsis size={16} />} />
      </Popover>
    </Capsule>
    {nodes.length > 0 && !state.component?.state.progress && <div className={styles.progress}><ProgressCapsule label="任务节点" current={nodes.filter((node) => node.status === "succeeded").length} total={nodes.length} title="当前目标树中已验收的任务节点；任务树调整时总数会变化" /></div>}
    {state.component && <div className={styles.report}><ResearchReport key={state.component.state.jobId} snapshot={state.component} /></div>}
    {(paused || state.approvalId) && <p aria-live="polite">{researchProgress(state)}</p>}
    {error && <p role="alert">{error}</p>}
  </aside>;
}
