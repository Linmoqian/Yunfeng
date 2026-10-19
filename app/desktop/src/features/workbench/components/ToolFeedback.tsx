/* 工具回执的轻量呈现：显示状态与实测耗时，参数和输出不进入主对话。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { CircleCheck, CircleHelp, CircleX, LoaderCircle, Wrench } from "lucide-react";
import { Capsule, Details } from "../../../components/common";
import type { ToolCallInfo } from "../toolFeedback";
import styles from "./ToolFeedback.module.css";

const names: Record<string, string> = { read: "读取", modify: "修改", terminal: "终端", horizon: "视界", edit: "修改", write: "写入", bash: "终端" };
function receipt(call: ToolCallInfo) {
  const outcome = !call.finishedAt ? "running" : call.outcome ?? (call.isError ? "failed" : "succeeded");
  const label = { running: "处理中", succeeded: "已完成", failed: "失败", cancelled: "已取消", unknown: "结果待核对" }[outcome];
  const Icon = outcome === "running" ? LoaderCircle : outcome === "succeeded" ? CircleCheck : outcome === "failed" ? CircleX : CircleHelp;
  const tone = outcome === "succeeded" ? "success" : outcome === "failed" ? "danger" : outcome === "running" ? "accent" : "warning";
  const elapsed = call.elapsedMs ?? (call.startedAt && call.finishedAt ? Date.parse(call.finishedAt) - Date.parse(call.startedAt) : undefined);
  const duration = elapsed !== undefined && Number.isFinite(elapsed) && elapsed >= 0 && outcome !== "unknown" ? elapsed < 1000 ? `${Math.round(elapsed)} ms` : `${(elapsed / 1000).toFixed(1)} s` : "";
  return { outcome, label, Icon, tone, duration } as const;
}
function ToolReceipt({ call }: { call: ToolCallInfo }) {
  const { outcome, label, Icon, tone, duration } = receipt(call);
  return <Capsule className={styles.receipt} tone={tone} status={outcome} value={`${outcome}:${duration}`} title={`${names[call.name] ?? call.name} · ${label}`}>
    <Icon size={13} aria-hidden="true" className={outcome === "running" ? styles.running : undefined} />
    <span className={styles.name}>{names[call.name] ?? call.name}</span><span>{label}</span>{duration && <time>{duration}</time>}
  </Capsule>;
}
export function ToolFeedback({ calls }: { calls: ToolCallInfo[] }) {
  if (!calls.length) return null;
  const active = calls.filter((call) => !call.finishedAt).length;
  // 失败、取消及未知结果优先可见；不能被随后成功的小工具挤入详情。
  const attention = calls.filter((call) => call.finishedAt && receipt(call).outcome !== "succeeded");
  const visible = [...new Map([...calls.filter((call) => !call.finishedAt), ...attention, ...calls.slice(-3)].map((call) => [call.callId, call])).values()];
  return <section className={styles.feedback} aria-label="工具调用反馈">
    <div className={styles.heading}><Wrench size={13} aria-hidden="true" /><span>工具调用</span><small>{active ? `${active} 项处理中` : "本次回执"}</small></div>
    <div className={styles.receipts} aria-live="polite">{visible.map((call) => <ToolReceipt key={call.callId} call={call} />)}</div>
    <Details label="调用记录"><ul className={styles.records}>{calls.map((call) => {
      const item = receipt(call);
      return <li key={call.callId}><span>{names[call.name] ?? call.name}</span><span>{item.label}</span><time>{item.duration}</time></li>;
    })}</ul><small>仅保留最近作业的最多 12 条回执；耗时包含提交、仲裁等待与执行，工具完成不代表实验验收。</small></Details>
  </section>;
}
