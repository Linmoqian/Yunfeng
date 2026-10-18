/* agent-eval v1 报告的只读展示契约；不保存或执行导入的指令。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
export interface CallMeasurement { name: string; durationMs: number; status: "succeeded" | "failed"; error?: string }
export interface EvaluationRun {
  id: string; candidate: string; label: string; model: string; repeat: number; condition: string;
  task: { task_id: string; title?: string; category: string; instruction: string; tools: string[] };
  status: "completed" | "error" | "cancelled" | "timed_out";
  verdict: { status: "passed" | "failed" | "ungraded"; reason: string };
  durationMs: number;
  modelCalls: CallMeasurement[]; toolCalls: CallMeasurement[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  result?: { finalAnswer: string | null; trace: { steps: { index: number; kind: string; timestamp: number; action?: { name: string }; observation?: string; error?: string }[] } };
  error?: string;
}
export interface EvaluationReport {
  schemaVersion: 1; id: string; createdAt: string; source: "benchmark" | "fixture";
  evaluator: string; repeats: number; runs: EvaluationRun[];
}
