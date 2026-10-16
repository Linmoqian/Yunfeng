/* 有界关系调整：节点身份、实测结果和预算保持连续，禁止循环与运行中改挂。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { invalidateRelevance } from "../relevance/source.js";
import type { DecisionState } from "./types.js";
import { record, text } from "../values.js";
export interface RelationMove { node: string; parent: string }
export function parseMoves(value: unknown): RelationMove[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw new Error("每轮最多调整十条节点关系");
  const moves = value.map((value) => {
    const row = record(value);
    if (Object.keys(row).some((key) => !["node", "parent"].includes(key))) throw new Error("关系调整仅接受 node 和 parent");
    return { node: text(row.node, 100), parent: text(row.parent, 100) };
  });
  if (new Set(moves.map((move) => move.node)).size !== moves.length) throw new Error("同一节点不能重复调整");
  return moves;
}
/** 每个非根节点只属于一个分组，目标根节点固定，最多四层。 */
export function validateRelations(state: DecisionState): void {
  if (state.nodes.length > 100 || new Set(state.nodes.map((n) => n.id)).size !== state.nodes.length || state.nodes.some((n) => n.id === "mission")) throw new Error("目标树节点身份无效或超过上限");
  const nodes = new Map(state.nodes.map((node) => [node.id, node]));
  for (const node of state.nodes) {
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent !== "mission") {
      if (seen.has(parent) || seen.size >= 4) throw new Error("目标树存在循环或超过四层");
      seen.add(parent);
      const group = nodes.get(parent);
      if (!group || group.kind !== "group") throw new Error("父节点必须是已知目标分组");
      parent = group.parent;
    }
  }
}
export function moveRelations(previous: DecisionState, moves: RelationMove[]): DecisionState {
  const state = structuredClone(previous);
  for (const move of moves) {
    const node = state.nodes.find((n) => n.id === move.node);
    if (!node) throw new Error("待调整节点不存在");
    if (node.parent === move.parent) continue;
    const subtree = new Set([node.id]);
    for (let i = 0; i < state.nodes.length; i++) for (const child of state.nodes) if (subtree.has(child.parent)) subtree.add(child.id);
    if (state.nodes.some((n) => subtree.has(n.id) && n.status === "running")) throw new Error("运行中的节点及其分组不能调整关系");
    node.parent = move.parent;
  }
  validateRelations(state);
  invalidateRelevance(state);
  return state;
}
