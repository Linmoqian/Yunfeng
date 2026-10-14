/* 决策层核心验收：优先级、预算、重复尝试、有界树和条件锁定。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createDecision, decide, feedback, reserveExecution } from "../src/research/decision/engine.js";
import { parseProposal } from "../src/research/decision/proposal.js";
import type { ResearchCheckpoint, Plan } from "../src/research/types.js";
const condition = { kind: "metric" as const, path: ".lin/experiments/metrics.json", key: "accuracy", operator: ">=" as const, value: 0.93 };
const candidate = (key: string, gain = 0.8, cost = 0.1, parent = "mission") => ({ key, parent, objective: key, kind: "execute", confidence: 0.8, cost, expected_gain: gain });
const proposal = (candidates: unknown[]) => parseProposal({ decision: "select", reason: "依据成本与收益排序", candidates, mission_condition: condition });

test("规则评分选择低成本高收益任务，保留目标树与滚动窗口", () => {
  const initial = createDecision("提升检测精度");
  const state = decide(initial, proposal([
    { ...candidate("数据问题"), kind: "group" },
    candidate("清洗标签", 1, 0.1, "数据问题"),
    candidate("扩充数据", 0.6, 0.9, "数据问题"),
    { ...candidate("模型问题"), kind: "group" },
    candidate("换模型", 0.7, 0.9, "模型问题"),
  ]));
  assert.equal(initial.nodes.length, 0);
  const selected = state.nodes.find((n) => n.id === state.selectedId)!;
  assert.equal(selected.objective, "清洗标签");
  assert.equal(selected.priority, 0.72);
  assert.equal(state.nodes.find((n) => n.id === selected.parent)?.objective, "数据问题");
  assert.equal(state.horizon.length, 3);
  const updated = decide(state, proposal([]));
  assert.deepEqual(updated.horizon, state.horizon);
});

test("执行预算先预留，身份与尝试持久化，重复事实与条件削弱被阻断", () => {
  const tree = decide(createDecision("提升精度", 0.15), proposal([candidate("实验") ]));
  const checkpoint: ResearchCheckpoint = { schemaVersion: 1, goal: "提升精度", phase: "PLANNING", cycle: 1, maxCycles: 20, reason: "验收", permissions: { commands: [], writeRoots: [] }, decision: tree, observation: { facts: [], events: [], memory: [], constraints: [] } };
  const plan: Plan = { decision: "act", reason: "写实验结果", node_id: tree.selectedId, steps: [{ action: "write_file", path: condition.path, content: '{"accuracy":0.8}' }], success_condition: condition };
  checkpoint.plan = plan;
  reserveExecution(checkpoint, plan, "job-1");
  assert.equal(tree.budget.spent, 0.1);
  assert.equal(tree.nodes[0]!.status, "running");
  const restored = JSON.parse(JSON.stringify(checkpoint)) as ResearchCheckpoint;
  feedback(restored, { job_id: "job-1", status: "failed", evaluation: { passed: false, actual: 0.8, reason: "指标未达标" }, output: "大段日志" });
  assert.equal(restored.decision!.nodes[0]!.attempts, 1);
  assert.equal(restored.decision!.nodes[0]!.result!.output, undefined);
  assert.throws(() => reserveExecution(restored, { ...plan, success_condition: { ...condition, value: 0.8 } }, "job-2"), /相同项目事实/);
  assert.equal(restored.decision!.budget.spent, 0.1);
  const limited = decide(checkpoint.decision!, proposal([candidate("第二任务", 1, 0.1)]));
  assert.equal(limited.selectedId, undefined);
  assert.throws(() => decide(tree, { ...proposal([]), mission_condition: { ...condition, value: 0.8 } }), /锁定/);
  feedback(checkpoint, { job_id: "job-1", status: "failed" });
  assert.equal(tree.nodes[0]!.status, "failed");
});

test("模型不能无限扩展、重置身份或生成循环父节点", () => {
  assert.throws(() => proposal(Array.from({ length: 6 }, (_, i) => candidate(`任务${i}`))), /最多 5/);
  assert.throws(() => decide(createDecision("目标"), proposal([{ ...candidate("自循环", 1, 0, "自循环"), kind: "group" }])), /父节点/);
  assert.throws(() => decide(createDecision("目标"), proposal([candidate("mission")])), /身份/);
  let state = createDecision("目标");
  for (let batch = 0; batch < 20; batch += 1) state = decide(state, proposal(Array.from({ length: 5 }, (_, i) => candidate(`任务${batch * 5 + i}`))));
  assert.equal(state.nodes.length, 100);
  assert.equal(state.horizon.length, 5);
  assert.throws(() => decide(state, proposal([candidate("第101个任务")])), /100 个/);
});
