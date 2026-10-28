/* 会话中的工具调用行：直接呈现状态，按需查看实际参数与结果。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import { Check, ChevronRight, CircleAlert, LoaderCircle, Wrench } from "lucide-react";
import { useState } from "react";
import type { ToolCallInfo } from "../toolFeedback";
import styles from "./ToolFeedback.module.css";

const names: Record<string, string> = { read: "读取", modify: "修改", terminal: "终端", horizon: "视界", edit: "修改", write: "写入", bash: "终端" };
function receipt(call: ToolCallInfo) {
  const outcome = !call.finishedAt ? "running" : call.outcome ?? (call.isError ? "failed" : "succeeded");
  const label = { running: "运行中", succeeded: "已完成", failed: "失败", cancelled: "已取消", unknown: "结果待核对" }[outcome];
  const elapsed = call.elapsedMs ?? (call.startedAt && call.finishedAt ? Date.parse(call.finishedAt) - Date.parse(call.startedAt) : undefined);
  const duration = elapsed !== undefined && Number.isFinite(elapsed) && elapsed >= 0 && outcome !== "unknown" ? elapsed < 1000 ? `${Math.round(elapsed)} ms` : `${(elapsed / 1000).toFixed(1)} s` : "";
  return { outcome, label, duration };
}

/** 主行只展示文件目标；完整参数与结果保留在折叠区域。 */
function target(call: ToolCallInfo): string {
  if (!call.args || typeof call.args !== "object" || Array.isArray(call.args)) return "";
  const args = call.args as Record<string, unknown>;
  const path = args.path ?? args.file_path;
  return typeof path === "string" ? path.replace(/[\r\n\t]/g, " ").slice(0, 120) : "";
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? ""; } catch { return "无法显示此内容"; }
}

function ToolRow({ call }: { call: ToolCallInfo }) {
  const [open, setOpen] = useState(false);
  const { outcome, label, duration } = receipt(call);
  const Icon = outcome === "running" ? LoaderCircle : outcome === "succeeded" ? Check : CircleAlert;
  const name = names[call.name] ?? call.name;
  const destination = target(call);
  return <div className={styles.row} data-outcome={outcome}>
    <button type="button" className={styles.trigger} aria-expanded={open} onClick={() => setOpen(!open)}>
      <ChevronRight size={14} className={styles.chevron} aria-hidden="true" />
      <Icon size={14} className={outcome === "running" ? styles.running : styles.icon} aria-hidden="true" />
      <span className={styles.name}>{name}</span>
      {destination && <span className={styles.target} title={destination}>{destination}</span>}
      <span className={styles.status}>{label}</span>{duration && <time>{duration}</time>}
    </button>
    {open && <div className={styles.detail}>
      {call.args !== undefined && <section><span>参数</span><pre>{text(call.args)}</pre></section>}
      {call.result !== undefined && <section><span>结果摘要</span><pre>{text(call.result)}</pre></section>}
      {call.args === undefined && call.result === undefined && <span>暂无调用详情</span>}
    </div>}
  </div>;
}

/** 只展示已有事件，重复事件的合并由领域层负责。 */
export function ToolFeedback({ calls }: { calls: ToolCallInfo[] }) {
  if (!calls.length) return null;
  return <section className={styles.feedback} aria-label="工具调用反馈">
    <div className={styles.heading}><Wrench size={13} aria-hidden="true" />工具调用</div>
    <div aria-live="polite">{calls.map((call) => <ToolRow key={call.callId} call={call} />)}</div>
  </section>;
}
