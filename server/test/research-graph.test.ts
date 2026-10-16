/* 关系图的任务隔离、租约、人工优先与执行白名单回归。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ResearchGraphComponent } from "../src/research/graph-component.js";
import { step } from "../src/research/validation.js";
import type { TaskState } from "../src/task/types.js";

test("组件聚焦需新鲜可见反馈，拖动立即让出，旧反馈与失联不重放控制", async () => {
  let now = 1000;
  const task = { lastEventSeq: 8, autonomy: { decision: { selectedId: "exp", nodes: [{ id: "exp" }] } } } as TaskState;
  const graph = new ResearchGraphComponent(() => task, () => now);
  const other = new ResearchGraphComponent(() => task, () => now);
  const focus = () => graph.call({ action: "focus", component: "research-graph", target: "current" });
  assert.equal((await focus() as any).accepted, false);
  const report = { sequence: 1, visible: true, editing: false, renderedRevision: 8, focusedRevision: null };
  graph.receive(report);
  assert.equal(graph.status().rendered, true);
  const accepted = await graph.call({ action: "focus", component: "research-graph", target: "current" }) as { epoch: string; revision: number; target: string };
  assert.equal(accepted.target, "exp");
  assert.equal(other.status().known, false);
  other.receive({ ...report, epoch: accepted.epoch, focusedRevision: accepted.revision });
  assert.equal(other.status().focusedRevision, null); // 新服务不继承旧焦点确认。
  assert.notEqual((await other.call({ action: "focus", component: "research-graph", target: "current" }) as any).epoch, accepted.epoch);
  graph.receive({ ...report, sequence: 2, editing: true, focusedRevision: accepted.revision });
  assert.equal((await focus() as any).reason, "COMPONENT_BUSY");
  graph.receive(report);
  assert.equal(graph.status().editing, true);
  graph.receive({ ...report, sequence: 3 });
  assert.equal((await graph.call({ action: "read", component: "research-graph" }) as any).focus.target, null);
  await assert.rejects(graph.call({ action: "focus", component: "research-graph", target: "foreign" }), /节点不存在/);
  assert.throws(() => graph.receive({ ...report, sequence: 4, renderedRevision: 9 }), /版本尚未发布/);
  now += 3000;
  assert.equal((await focus() as any).accepted, false);
  assert.deepEqual(step({ action: "focus_component", component: "research-graph" }), { action: "focus_component", component: "research-graph", target: "current" });
  assert.throws(() => step({ action: "focus_component", component: "research-graph", taskId: "other" }));
});
