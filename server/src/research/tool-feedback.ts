/* execute 的工具生命周期投影；反馈不携带文件正文、命令参数或终端输出。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { performance } from "node:perf_hooks";
import type { Step } from "./types.js";

export interface ExecutionFeedback {
  type: "tool_started" | "tool_finished";
  data: { callId: string; jobId: string; name: string; startedAt: string;
    finishedAt?: string; elapsedMs?: number; outcome?: "succeeded" | "failed" | "cancelled"; isError?: boolean };
}
export type FeedbackSink = (event: ExecutionFeedback) => Promise<void>;

/** 提交到 execute 的步骤包含仲裁等待；回执成功只表示工具返回，不代表实验验收。 */
export async function traceExecution<T>(jobId: string, index: number, step: Step, signal: AbortSignal, sink: FeedbackSink | undefined, operation: () => Promise<T>): Promise<T> {
  const name = step.action === "read_file" ? "read" : ["write_file", "patch_file"].includes(step.action) ? "modify" : step.action === "run_command" ? "terminal" : "horizon";
  const data = { callId: `${jobId}:${index}`, jobId, name, startedAt: new Date().toISOString() };
  const emit = async (event: ExecutionFeedback) => {
    // UI 反馈故障不能把已经完成的副作用变成可重试实验。
    try { await sink?.(event); } catch { console.error("[research] 工具反馈保存失败"); }
  };
  const start = performance.now();
  await emit({ type: "tool_started", data });
  let outcome: "succeeded" | "failed" | "cancelled" = "failed";
  try {
    signal.throwIfAborted();
    const value = await operation();
    outcome = "succeeded";
    return value;
  } catch (error) {
    outcome = signal.aborted ? "cancelled" : "failed";
    throw error;
  } finally {
    await emit({ type: "tool_finished", data: { ...data, outcome, isError: outcome !== "succeeded", elapsedMs: performance.now() - start, finishedAt: new Date().toISOString() } });
  }
}
