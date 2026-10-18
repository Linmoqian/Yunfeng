/* 外部报告校验与同条件聚合；未知评分不计作通过，耗时不生成虚假精度。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import type { CallMeasurement, EvaluationReport, EvaluationRun } from "./types";
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
function calls(value: unknown): value is CallMeasurement[] {
  return Array.isArray(value) && value.length <= 10000 && value.every((call) => object(call) && text(call.name) && number(call.durationMs) && ["succeeded", "failed"].includes(String(call.status)) && (call.error === undefined || typeof call.error === "string"));
}
function run(value: unknown): value is EvaluationRun {
  if (!object(value) || !["id", "candidate", "label", "model", "condition"].every((key) => text(value[key]))) return false;
  if (!number(value.repeat) || !Number.isInteger(value.repeat) || value.repeat < 1 || !number(value.durationMs)) return false;
  if (!["completed", "error", "cancelled", "timed_out"].includes(String(value.status))) return false;
  const { task, verdict, usage, result } = value;
  if (!object(task) || !text(task.task_id) || !text(task.category) || !text(task.instruction) || !Array.isArray(task.tools) || !task.tools.every(text)) return false;
  if (task.title !== undefined && !text(task.title)) return false;
  if (!object(verdict) || !["passed", "failed", "ungraded"].includes(String(verdict.status)) || !text(verdict.reason)) return false;
  if (value.status !== "completed" && verdict.status === "passed") return false;
  if (!object(usage) || ![usage.promptTokens, usage.completionTokens, usage.totalTokens].every(number)) return false;
  if (!calls(value.modelCalls) || !calls(value.toolCalls) || (value.error !== undefined && typeof value.error !== "string")) return false;
  if (result !== undefined) {
    if (!object(result) || (result.finalAnswer !== null && typeof result.finalAnswer !== "string") || !object(result.trace) || !Array.isArray(result.trace.steps) || result.trace.steps.length > 10000) return false;
    if (!result.trace.steps.every((step) => object(step) && number(step.index) && text(step.kind) && number(step.timestamp)
      && (step.observation === undefined || typeof step.observation === "string") && (step.error === undefined || typeof step.error === "string")
      && (step.action === undefined || (object(step.action) && text(step.action.name))))) return false;
  }
  return true;
}

/** 只接受 v1 有界 JSON 报告；验证失败时调用方保留原有结果。 */
export function parseEvaluationReport(raw: unknown): EvaluationReport {
  if (!object(raw) || raw.schemaVersion !== 1 || !text(raw.id) || !text(raw.createdAt) || !Number.isFinite(Date.parse(raw.createdAt)) || !["benchmark", "fixture"].includes(String(raw.source)) || !text(raw.evaluator)) throw new Error("不是受支持的 agent-eval v1 报告");
  if (!number(raw.repeats) || !Number.isInteger(raw.repeats) || raw.repeats < 1 || raw.repeats > 100 || !Array.isArray(raw.runs) || !raw.runs.length || raw.runs.length > 2000 || !raw.runs.every(run)) throw new Error("报告样本或指标无效，最多支持 2000 次运行");
  const runs = raw.runs as EvaluationRun[];
  if (new Set(runs.map((item) => item.id)).size !== runs.length || new Set(runs.map((item) => JSON.stringify([item.task.task_id, item.candidate, item.condition, item.repeat]))).size !== runs.length || runs.some((item) => item.repeat > Number(raw.repeats))) throw new Error("报告包含重复或越界样本");
  const conditions = new Map<string, string>();
  for (const item of runs) {
    const identity = JSON.stringify([item.task.task_id, item.task.instruction, item.task.category, [...item.task.tools].sort(), item.model]);
    if (conditions.has(item.condition) && conditions.get(item.condition) !== identity) throw new Error("同一比较条件包含不一致的任务或模型");
    conditions.set(item.condition, identity);
  }
  return raw as unknown as EvaluationReport;
}

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
export const duration = (ms: number) => ms < 1 ? "<1 ms" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
export function summarize(runs: EvaluationRun[]) {
  return { total: runs.length, passed: runs.filter((item) => item.verdict.status === "passed").length, ungraded: runs.filter((item) => item.verdict.status === "ungraded").length,
    durationMs: median(runs.map((item) => item.durationMs)), tools: runs.reduce((sum, item) => sum + item.toolCalls.length, 0), models: runs.reduce((sum, item) => sum + item.modelCalls.length, 0), tokens: runs.reduce((sum, item) => sum + item.usage.totalTokens, 0) };
}

/** 报告条件指纹包含模型与任务参数；不同条件分开选择，避免混合排名。 */
export function comparisonGroups(report: EvaluationReport) {
  return [...new Set(report.runs.map((item) => item.condition))].map((condition, index) => {
    const runs = report.runs.filter((item) => item.condition === condition), first = runs[0];
    return { value: condition, label: `${first.task.task_id} · ${first.model}${report.runs.some((item) => item.task.task_id === first.task.task_id && item.model === first.model && item.condition !== condition) ? ` · 条件 ${index + 1}` : ""}`, runs };
  });
}
