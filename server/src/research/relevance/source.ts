/* 节点描述或层级变化后清除旧建议；状态和指标变化不重复计算词向量。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { createHash } from "node:crypto";
import type { DecisionState } from "../decision/types.js";
export function relevanceSource(tree: DecisionState): string {
  return createHash("sha256").update(JSON.stringify([tree.mission.objective, tree.nodes.map((n) => [n.id, n.parent, n.kind, n.objective])])).digest("hex");
}
export function invalidateRelevance(tree: DecisionState): void {
  const source = relevanceSource(tree);
  for (const node of [tree.mission, ...tree.nodes]) if (node.relevance?.source !== source) delete node.relevance;
}
