/* 将服务端目标树布局为双向分支；异常关系保留节点但不补造连线。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { ResearchDecisionState } from "../../services/taskService";

export const researchNodeStatus = { pending: "待执行", running: "进行中", succeeded: "验收通过", failed: "未通过", blocked: "受阻" };
export type ResearchGraphItem = {
  id: string; parent?: string; objective: string; side: number;
  kind: "mission" | "group" | "explore" | "execute";
  status: keyof typeof researchNodeStatus; current: boolean;
  position: { x: number; y: number };
};

/** 仅 parent 构成关系；horizon 和 selectedId 用于标记，不推断任务依赖。 */
export function layoutResearchGraph(decision: ResearchDecisionState): { items: ResearchGraphItem[]; disconnected: number } {
  // 固定预留上下胶囊的空间，展开时不移动节点；胶囊随画布缩小。
  const rowHeight = 200;
  const items: ResearchGraphItem[] = [{ id: "mission", objective: decision.mission.objective, side: 0, kind: "mission", status: "pending", current: false, position: { x: 0, y: 0 } }];
  const children = (id: string) => decision.nodes.filter((node) => node.parent === id && node.id !== "mission");
  const visited = new Set(["mission"]);
  const weight = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 1;
    const next = new Set(seen).add(id);
    return Math.max(1, children(id).reduce((sum, node) => sum + weight(node.id, next), 0));
  };
  function place(node: ResearchDecisionState["nodes"][number], side: number, depth: number, top: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const height = weight(node.id) * rowHeight;
    items.push({ id: node.id, parent: node.parent, objective: node.objective, side, kind: node.kind,
      status: node.status, current: node.id === decision.selectedId, position: { x: side * depth * 300, y: top + height / 2 - rowHeight / 2 } });
    let cursor = top;
    for (const child of children(node.id)) { place(child, side, depth + 1, cursor); cursor += weight(child.id) * rowHeight; }
  }
  const roots = children("mission");
  for (const side of [-1, 1]) {
    const branches = roots.filter((_, index) => index % 2 === (side === 1 ? 0 : 1));
    let top = -branches.reduce((sum, node) => sum + weight(node.id) * rowHeight, 0) / 2 + rowHeight / 2;
    for (const node of branches) { place(node, side, 1, top); top += weight(node.id) * rowHeight; }
  }
  const missing = decision.nodes.filter((node) => !visited.has(node.id));
  const bottom = items.reduce((max, item) => Math.max(max, item.position.y), 0);
  missing.forEach((node, index) => items.push({ id: node.id, objective: node.objective, kind: node.kind, side: 1,
    status: node.status, current: node.id === decision.selectedId, position: { x: 300, y: (index + 1) * rowHeight + bottom } }));
  return { items, disconnected: missing.length };
}
