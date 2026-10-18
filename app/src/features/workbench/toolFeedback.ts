/* 将既有工具事件折叠为有界回执；补发、重复与乱序事件不重复展示或回退状态。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import type { TaskStreamEvent } from "../../services/taskService";

export interface ToolCallInfo {
  callId: string; name: string; jobId?: string; args?: unknown; result?: unknown;
  startedAt?: string; finishedAt?: string; elapsedMs?: number; isError?: boolean;
  outcome?: "succeeded" | "failed" | "cancelled" | "unknown";
  seq?: number;
}
const limit = 12;
export function reduceToolFeedback(current: ToolCallInfo[], event: TaskStreamEvent): ToolCallInfo[] {
  if (!["tool_started", "tool_updated", "tool_finished"].includes(event.type)) return current;
  const data = event.data as Partial<ToolCallInfo> | undefined;
  if (!data || typeof data.callId !== "string" || !data.callId) return current;
  const previous = current.find((call) => call.callId === data.callId);
  if (previous?.seq !== undefined && event.seq !== undefined && event.seq <= previous.seq) return current;
  if (previous?.finishedAt && event.type !== "tool_finished") return current;
  if (event.type === "tool_updated" && !previous) return current;
  let calls = current;
  if (event.type === "tool_started" && !previous) {
    // 新作业只保留本次回执；同一作业并行工具不会互相清除。
    calls = data.jobId ? current.filter((call) => call.jobId === data.jobId) : current;
  }
  const finished = event.type === "tool_finished";
  const next: ToolCallInfo = { ...previous, callId: data.callId, name: data.name ?? previous?.name ?? "工具", seq: event.seq,
    ...(data.jobId ? { jobId: data.jobId } : {}), ...(data.startedAt ? { startedAt: data.startedAt } : {}),
    ...(event.type === "tool_started" ? { args: data.args } : {}),
    ...(event.type === "tool_updated" ? { result: (event.data as { partialResult?: unknown }).partialResult } : {}),
    ...(finished ? { finishedAt: data.finishedAt ?? event.occurredAt ?? "unknown", isError: data.isError, result: data.result,
      elapsedMs: typeof data.elapsedMs === "number" && Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 ? data.elapsedMs : undefined,
      outcome: data.outcome === "cancelled" ? "cancelled" : data.isError ? "failed" : "succeeded" } : {}),
  };
  return [...calls.filter((call) => call.callId !== next.callId), next].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).slice(-limit);
}

/** 重启或回合结束缺少完成事件时，只标记结果未知，不能宣称成功或重放工具。 */
export function settleToolFeedback(calls: ToolCallInfo[], at: string): ToolCallInfo[] {
  return calls.map((call) => call.finishedAt ? call : { ...call, finishedAt: at, outcome: "unknown" });
}
