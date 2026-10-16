/* 决策模型只能提交有限候选与估计，节点身份、状态和预算由 Runtime 管理。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { parseMoves } from "./relations.js";
import { condition, record, text } from "../validation.js";
import type { Candidate, DecisionProposal } from "./types.js";
function unit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("候选评分须为 0 到 1 的有限数值");
  return value;
}
export function parseProposal(value: unknown): DecisionProposal {
  const item = record(value);
  if (!["select", "wait", "ask", "stop", "complete"].includes(String(item.decision)) || !Array.isArray(item.candidates) || item.candidates.length > 10) throw new Error("决策提案无效或节点过多");
  const candidates: Candidate[] = item.candidates.map((value) => {
    const row = record(value);
    if (!["group", "explore", "execute"].includes(String(row.kind))) throw new Error("候选类型无效");
    return { key: text(row.key, 100), parent: text(row.parent, 100), objective: text(row.objective, 1000), kind: row.kind as Candidate["kind"], confidence: unit(row.confidence), cost: unit(row.cost), expected_gain: unit(row.expected_gain) };
  });
  if (candidates.filter((n) => n.kind !== "group").length > 5 || new Set(candidates.map((n) => n.key)).size !== candidates.length) throw new Error("每轮最多 5 个任务，候选 key 不能重复");
  const paths = item.observe_paths ?? [];
  if (!Array.isArray(paths) || paths.length > 8) throw new Error("决策观察路径无效");
  return { decision: item.decision as DecisionProposal["decision"], reason: text(item.reason), candidates, relations: parseMoves(item.relations), observe_paths: paths.map((p) => text(p, 500)), ...(item.mission_condition === undefined ? {} : { mission_condition: condition(item.mission_condition) }) };
}
