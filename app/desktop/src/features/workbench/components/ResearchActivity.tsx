/* 科研响应进展：呈现真实阶段与节点；计时只覆盖本次 Hook 唤醒，不代表模型推理耗时。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useState } from "react";
import type { TaskState } from "../../../services/taskService";
import { Capsule, Details, MapleCloudLoading } from "../../../components/common";
import styles from "./ResearchRuntimeCard.module.css";

/** 空闲等待不显示工作动画，实验仍运行时保留活动反馈。 */
export function researchWorking(task: TaskState): boolean {
  const state = task.autonomy;
  return Boolean(state && !state.approvalId && (["OBSERVING", "PLANNING", "EXECUTING", "REFLECTING"].includes(state.phase)
    || (state.phase === "WAITING" && state.jobId)));
}
export function ResearchResponseClock({ task, working }: { task: TaskState; working: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!working) return;
    setNow(Date.now());
    const timer = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => window.clearInterval(timer);
  }, [working, task.id]);
  const timestamp = task.autonomy?.trigger?.receivedAt;
  if (!timestamp) return null;
  const start = Date.parse(timestamp), end = working ? now : Date.parse(task.updatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const value = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <time className={styles.clock} dateTime={`PT${seconds}S`} aria-live="off" aria-label={`本次响应用时 ${value}`} title="从服务端本次唤醒开始计时，包含观察、模型请求和工具等待；空闲时停止">{value}</time>;
}
const stages = {
  OBSERVING: "正在查看项目与实验状态",
  PLANNING: "正在分析目标，选择下一步",
  EXECUTING: "正在执行已确认的实验步骤",
  REFLECTING: "正在核对实测结果，整理结论",
  WAITING: "等待项目变化，收到新信息后继续",
  PAUSED: "已暂停", COMPLETED: "研究已完成", FAILED: "需要处理",
};

export function ResearchActivity({ task }: { task: TaskState }) {
  const state = task.autonomy;
  if (!state || state.phase === "COMPLETED") return null;
  const working = researchWorking(task);
  const node = state.decision?.nodes.find((item) => item.id === state.decision?.selectedId);
  const presentation = node?.presentation ?? state.decision?.mission.presentation;
  const title = state.approvalId ? "等待你确认实验计划" : state.phase === "WAITING" && state.jobId ? "实验正在运行，等待完成结果" : stages[state.phase];
  const attention = state.phase === "FAILED" || state.phase === "PAUSED" || Boolean(state.approvalId);
  const result = state.result;
  const evaluation = result?.evaluation;
  const nodes = state.decision?.nodes.filter((item) => item.kind !== "group") ?? [];
  return <section className={styles.activity} aria-label="科研工作进展" aria-busy={working}>
    <div className={styles.activityHeading}>
      {working && <MapleCloudLoading compact />}
      <strong role="status">{title}</strong>{!["PAUSED", "FAILED"].includes(state.phase) && <ResearchResponseClock task={task} working={working} />}
    </div>
    {presentation && <div className={styles.node}><strong>{presentation.title}</strong><p>{presentation.summary}</p></div>}
    <div className={styles.activityMeta}><Capsule animateOnMount={false}>第 {state.cycle} 轮</Capsule>{nodes.length > 0 && <Capsule animateOnMount={false} title="当前目标树的节点验收进展">已验收 {nodes.filter((item) => item.status === "succeeded").length} / {nodes.length}</Capsule>}
      {evaluation && <Capsule tone={evaluation.passed ? "success" : "danger"} value={String(evaluation.passed)}>{evaluation.passed ? "节点验收通过" : "节点验收未通过"}</Capsule>}
      {result && !evaluation && <Capsule tone={result.status === "failed" ? "danger" : "warning"}>{({ running: "作业处理中", succeeded: "执行完成，待验收", failed: "执行失败", cancelled: "执行已取消", interrupted: "结果待核对" })[result.status]}</Capsule>}
    </div>
    {attention && <p className={styles.attention} role="note">{state.approvalId ? "请在上方确认执行范围，授权后继续。" : state.reason}</p>}
    <Details label="运行详情"><p className={styles.activityReason}>{state.reason}</p><small>本次响应计时包含等待，不等于模型推理耗时。</small></Details>
  </section>;
}
