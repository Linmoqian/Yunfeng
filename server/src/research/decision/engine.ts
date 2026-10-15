/* 有界目标树、确定性评分、滚动选择和执行预算；无模型调用或系统副作用。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { createHash } from "node:crypto";
import type { Plan, ResearchCheckpoint, Result } from "../types.js";
import type { DecisionProposal, DecisionState, TaskNode } from "./types.js";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const identity = (objective: string) => objective.trim().replace(/\s+/g, " ").toLowerCase();
/** 每个任务最多尝试两次；历史保留在有界树内，模型不可重置。 */
export function createDecision(goal: string, budget = 10): DecisionState {
  return { mission: { id: "mission", objective: goal }, nodes: [], horizon: [], budget: { limit: budget, spent: 0 }, reason: "等待局部决策" };
}
export function score(node: Pick<TaskNode, "expected_gain" | "confidence" | "cost">): number {
  return Number((node.expected_gain * 0.5 + node.confidence * 0.3 - node.cost * 0.2).toFixed(6));
}
function depth(state: DecisionState, id: string): number {
  const visited = new Set<string>();
  while (id !== "mission") {
    if (visited.has(id) || visited.size >= 4) throw new Error("目标树存在循环或超过四层");
    visited.add(id);
    const parent = state.nodes.find((n) => n.id === id);
    if (!parent || parent.kind !== "group") throw new Error("父节点必须是已知目标分组");
    id = parent.parent;
  }
  return visited.size;
}
/** 合并时保留尝试次数、结果与身份，按收益评分生成最多五个待选节点。 */
export function decide(previous: DecisionState, proposal: DecisionProposal): DecisionState {
  const state = structuredClone(previous);
  state.reason = proposal.reason;
  state.selectedId = undefined;
  if (proposal.mission_condition) {
    if (state.mission.condition && JSON.stringify(state.mission.condition) !== JSON.stringify(proposal.mission_condition)) throw new Error("长期目标验收条件已锁定，模型不能更换");
    state.mission.condition ??= proposal.mission_condition;
  }
  const aliases = new Map<string, string>([["mission", "mission"], ...state.nodes.map((n) => [n.id, n.id] as [string, string])]);
  for (const candidate of proposal.candidates) {
    const parent = aliases.get(candidate.parent);
    if (!parent || depth(state, parent) >= 4) throw new Error("候选父节点无效或目标树过深");
    // 已有 ID 是稳定身份；滚动提案可重述说明，但不能借此新建节点或重置结果。
    const existing = state.nodes.find((n) => n.id === candidate.key)
      ?? state.nodes.find((n) => identity(n.objective) === identity(candidate.objective));
    if (existing && (existing.parent !== parent || existing.kind !== candidate.kind)) throw new Error("重复目标不能换父节点或类型来重置任务");
    const node: TaskNode = existing ?? { id: digest([state.mission.objective, identity(candidate.objective)]).slice(0, 24), parent, objective: candidate.objective, kind: candidate.kind, priority: 0, confidence: 0, cost: 0, expected_gain: 0, status: "pending", attempts: 0 };
    if (aliases.has(candidate.key) && aliases.get(candidate.key) !== node.id) throw new Error("候选 key 不能覆盖目标或已有节点身份");
    aliases.set(candidate.key, node.id);
    if (!existing) {
      if (state.nodes.length >= 100) throw new DecisionBlocked("目标树已达到 100 个节点上限，请工程师缩小范围");
      state.nodes.push(node);
    }
    if (["pending", "failed"].includes(node.status)) {
      Object.assign(node, { confidence: candidate.confidence, cost: candidate.cost, expected_gain: candidate.expected_gain });
      node.priority = score(node);
    }
  }
  const eligible = state.nodes.filter((n) => n.kind !== "group" && ["pending", "failed"].includes(n.status) && n.attempts < 2 && n.priority > 0 && n.cost <= state.budget.limit - state.budget.spent + 1e-9);
  state.horizon = eligible.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, 5).map((n) => n.id);
  if (proposal.decision === "select") {
    state.selectedId = state.horizon[0];
    if (!state.selectedId) state.reason = "没有可执行候选：检查预算、已完成任务或重复失败，需要工程师补充方向";
  }
  return state;
}
export class DecisionBlocked extends Error {}
/** 先预留估计预算并记录身份，再允许执行；重启不退还已预留成本。 */
export function reserveExecution(checkpoint: ResearchCheckpoint, plan: Plan, jobId: string): void {
  if (!plan.node_id) return;
  const state = checkpoint.decision;
  const node = state?.nodes.find((n) => n.id === plan.node_id);
  if (!state || !node || state.selectedId !== node.id || !["pending", "failed"].includes(node.status) || node.attempts >= 2) throw new DecisionBlocked("当前任务节点不可再次执行");
  const facts = (checkpoint.observation?.facts ?? []).filter((f) => f.key === "git.status" || f.key.startsWith("file:")).map((f) => [f.key, f.value]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  // 修改验收阈值不会改变实际动作，不允许借此绕过重复执行限制。
  const fingerprint = digest({ steps: plan.steps, facts });
  if (plan.decision === "act" && state.nodes.some((n) => n.fingerprint === fingerprint)) {
    node.status = "blocked";
    throw new DecisionBlocked("相同项目事实下已尝试相同计划，暂停以避免无效重复");
  }
  const cost = plan.decision === "act" ? node.cost : 0;
  if (state.budget.spent + cost > state.budget.limit + 1e-9) throw new DecisionBlocked("估计成本预算已用完");
  state.budget.spent = Number((state.budget.spent + cost).toFixed(6));
  node.attempts += 1; node.status = "running"; node.jobId = jobId; node.fingerprint = fingerprint;
}
/** 仅实测验收通过才将节点标为成功，反思文本不能修改验收状态。 */
export function feedback(checkpoint: ResearchCheckpoint, result: Result): void {
  const node = checkpoint.decision?.nodes.find((n) => n.id === checkpoint.plan?.node_id);
  if (!node || node.jobId !== result.job_id || node.result?.job_id === result.job_id) return;
  node.result = { job_id: result.job_id, status: result.status, evaluation: result.evaluation, completedAt: result.completedAt };
  node.status = result.status === "succeeded" && result.evaluation?.passed ? "succeeded" : node.attempts >= 2 ? "blocked" : "failed";
}
