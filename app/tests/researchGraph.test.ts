/* 关系图只使用真实父子关系，状态更新不会改变布局或伪造依赖。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { layoutResearchGraph, researchNodeText } from "../src/features/workbench/researchGraph.ts";
import type { ResearchDecisionState } from "../src/services/taskService.ts";
const node = (id: string, parent = "mission", kind: "group" | "execute" = "execute"): ResearchDecisionState["nodes"][number] => ({ id, parent, kind, objective: id, priority: 0.7, confidence: 0.8, cost: 0.1, expected_gain: 0.9, status: "pending", attempts: 0 });
const decision = (nodes: ResearchDecisionState["nodes"]): ResearchDecisionState => ({ mission: { id: "mission", objective: "研究目标" }, nodes, horizon: [], budget: { limit: 10, spent: 1 }, reason: "" });

test("中心目标向两侧分支，真实关系与状态保持一致，更新不重排", () => {
  const state = decision([node("group", "mission", "group"), node("a", "group"), node("b", "group"), node("c")]);
  state.selectedId = "a";
  const graph = layoutResearchGraph(state);
  const get = (id: string) => graph.items.find((item) => item.id === id)!;
  assert.deepEqual(get("mission").position, { x: 0, y: 0 });
  assert.ok(get("group").position.x > 0 && get("c").position.x < 0);
  assert.equal(get("a").parent, "group");
  // 节点高 80，上下胶囊与间距合计不超过 112；缩放不改变安全比例。
  assert.ok(Math.abs(get("a").position.y - get("b").position.y) >= 192);
  assert.equal(get("a").current, true);
  state.nodes[1].status = "succeeded";
  state.selectedId = "b";
  const updated = layoutResearchGraph(state);
  assert.deepEqual(updated.items.map((item) => item.position), graph.items.map((item) => item.position));
  assert.equal(updated.items.find((item) => item.id === "a")?.status, "succeeded");
});

test("缺失父节点或循环关系不补造连线，节点仍可查看", () => {
  const graph = layoutResearchGraph(decision([node("orphan", "absent"), node("a", "b", "group"), node("b", "a", "group")]));
  assert.equal(graph.items.length, 4);
  assert.equal(graph.disconnected, 3);
  assert.ok(graph.items.every((item) => !item.parent));
  assert.equal(new Set(graph.items.map((item) => item.position.y)).size, 4);
});

test("节点标题与概述取自目标原文，保留完整约束供悬停查看", () => {
  assert.deepEqual(researchNodeText({ kind: "execute", objective: "压缩实验：比较 level=1 与 level=9，校验解压一致。只读真实指标。" }),
    { title: "压缩实验", summary: "比较 level=1 与 level=9，校验解压一致。只读真实指标。" });
});
