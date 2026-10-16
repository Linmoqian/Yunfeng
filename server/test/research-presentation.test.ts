/* Agent 节点摘要的契约、稳定身份、旧记录补齐及持久化回归。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDecision, decide } from "../src/research/decision/engine.js";
import { parseProposal } from "../src/research/decision/proposal.js";
import { parsePresentation } from "../src/research/decision/presentation.js";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";
import { ResearchService } from "../src/research/service.js";
import { TaskStore } from "../src/task/task-store.js";
import type { Reasoner } from "../src/research/reasoner.js";
const presentation = { title: "压缩参数优化", summary: "比较压缩级别，核对体积与解压一致性。" };
const candidate = { key: "gzip", parent: "mission", objective: "只写配置后运行指定脚本，并核对实验验收条件", kind: "execute", confidence: 1, cost: 0.1, expected_gain: 1, presentation };
const proposal = (candidates: unknown[]) => parseProposal({ decision: "wait", reason: "等待实验", mission_presentation: presentation, candidates });

test("决策模型摘要随节点保存，改写展示不改变身份、完整目标、结果与预算", () => {
  const original = decide(createDecision("真实实验优化"), proposal([candidate]));
  original.nodes[0].status = "succeeded"; original.nodes[0].attempts = 1; original.nodes[0].jobId = "measured";
  const next = decide(original, proposal([{ ...candidate, key: original.nodes[0].id, objective: "不能用新描述替换已保存的执行目标", presentation: { ...presentation, title: "压缩实验验收" } }]));
  assert.equal(next.nodes.length, 1); assert.equal(next.nodes[0].objective, candidate.objective);
  assert.equal(next.nodes[0].id, original.nodes[0].id); assert.equal(next.nodes[0].jobId, "measured");
  assert.equal(next.nodes[0].presentation!.title, "压缩实验验收");
  assert.deepEqual(next.mission.presentation, presentation); assert.deepEqual(next.budget, original.budget);
  for (const value of [{ title: "", summary: "描述" }, { title: "标题", summary: "a\nb" }, { title: "a".repeat(33), summary: "描述" }]) assert.throws(() => parsePresentation(value));
});

test("旧节点按组件接口调用 Agent 总结，准确落库、重复读取不重算，伪造节点拒绝整批保存", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-presentation-"));
  const context = createTaskContextForDataDir(dir);
  let calls = 0, foreign = false;
  const reason: Reasoner = async (phase, data) => {
    assert.equal(phase, "summarize"); calls++;
    const { nodes } = data as { nodes: { id: string; objective: string }[] };
    return { presentations: nodes.map((node) => ({ node: foreign ? "foreign-node" : node.id, ...presentation })) };
  };
  const service = new ResearchService(context, createMemoryContextForDataDir(dir).service, () => reason);
  try {
    const task = context.store.create({ cwd: dir, sessionId: "summary", title: "科研", source: "task" });
    const tree = decide(createDecision("真实实验优化"), proposal([candidate]));
    delete tree.mission.presentation; delete tree.nodes[0].presentation;
    context.store.update(task.id, (state) => { state.mode = "research"; state.autonomy = { schemaVersion: 1, goal: tree.mission.objective, phase: "COMPLETED", cycle: 1, maxCycles: 20, reason: "已完成", permissions: { commands: [], writeRoots: [] }, decision: tree }; });
    const graph = service.graph(task.id);
    foreign = true;
    await assert.rejects(graph.client().summarize(task.lastEventSeq), /重复|对应/);
    assert.equal(task.autonomy!.decision!.mission.presentation, undefined);
    foreign = false;
    await graph.client().summarize(task.lastEventSeq);
    const saved = new TaskStore({ dataDir: dir }).get(task.id)!.autonomy!.decision!;
    assert.deepEqual(saved.mission.presentation, presentation); assert.deepEqual(saved.nodes[0].presentation, presentation);
    assert.equal(saved.nodes[0].objective, candidate.objective); assert.equal(saved.nodes[0].parent, "mission");
    await graph.client().summarize(task.lastEventSeq);
    assert.equal(calls, 2);
    await assert.rejects(graph.client().summarize(task.lastEventSeq - 1), /GRAPH_CONFLICT/);
    await assert.rejects(graph.call({ action: "summarize", component: "research-graph", revision: task.lastEventSeq, objective: "修改执行目标" }), /请求无效/);
  } finally { await service.close(); rmSync(dir, { recursive: true, force: true }); }
});
