/* 真实接口契约、向量校验、语义方向、数据库持久化与失败隔离的核心回归。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { RelevanceAnalyzer, parseClassification } from "../src/research/relevance/analysis.js";
import { configuredEmbedder, vectors } from "../src/research/relevance/embedding.js";
import { createDecision, decide } from "../src/research/decision/engine.js";
import { moveRelations } from "../src/research/decision/relations.js";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";
import { ResearchService } from "../src/research/service.js";
import { TaskStore } from "../src/task/task-store.js";
import type { Reasoner } from "../src/research/reasoner.js";

function tree() {
  return decide(createDecision("提升模型精度"), { decision: "select", reason: "采集数据后训练", observe_paths: [], candidates: [
    { key: "data", parent: "mission", objective: "数据质量", kind: "group", confidence: 1, cost: 0, expected_gain: 1 },
    { key: "train", parent: "mission", objective: "训练模型", kind: "execute", confidence: 1, cost: 0.1, expected_gain: 1 },
  ] });
}
const classify: Reasoner = async (phase, context) => {
  assert.equal(phase, "relate");
  const { candidates } = context as { candidates: { target: string }[] };
  return { matches: [{ target: candidates[0].target, relation: "abstraction", direction: "outgoing", confidence: 0.8, reason: "具体训练服务于提升精度" }] };
};
const signal = () => new AbortController().signal;
const provider = () => ({ model: "test-embedding", identity: "test", embed: async (input: string[]) => input.map(() => [3, 4]) });

test("兼容接口批量请求按 index 还原，不回显错误正文，拒绝无效向量", async () => {
  let body: { input: string[]; model: string };
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const part of req) chunks.push(part);
    body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ model: body.model, data: [{ index: 1, embedding: [0, 2] }, { index: 0, embedding: [3, 0] }] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const port = (server.address() as { port: number }).port;
    const embedder = configuredEmbedder({ YUNFENG_EMBEDDING_URL: `http://127.0.0.1:${port}/v1/embeddings`, YUNFENG_EMBEDDING_MODEL: "test" })!;
    assert.deepEqual(await embedder.embed(["甲", "乙"], signal()), [[1, 0], [0, 1]]);
    assert.deepEqual(body!.input, ["甲", "乙"]);
    for (const invalid of [[[0, 0]], [[NaN]], [[1], [1, 2]], Array(1)]) assert.throws(() => vectors(invalid, invalid.length), /词向量/);
    const failed = configuredEmbedder({ YUNFENG_EMBEDDING_URL: "https://example.com/embeddings", YUNFENG_EMBEDDING_MODEL: "test" }, async () => new Response("private-secret", { status: 401 }))!;
    await assert.rejects(failed.embed(["甲"], signal()), (error: Error) => error.message.includes("401") && !error.message.includes("private-secret"));
  } finally { server.closeAllConnections(); await new Promise<void>((done) => server.close(() => done())); }
});

test("余弦由服务器计算，关系方向由模型分类；缓存复用，层级变化清除旧建议", async () => {
  let embeds = 0, models = 0;
  const analyzer = new RelevanceAnalyzer(() => ({ ...provider(), embed: async (input) => { embeds++; return input.map(() => [3, 4]); } }));
  const original = tree(), node = original.nodes[1];
  const reason: Reasoner = async (...args) => { models++; return classify(...args); };
  const result = await analyzer.analyze(original, node.id, reason, signal());
  const relevance = result.nodes[1].relevance!;
  assert.equal(relevance.status, "ready"); assert.equal(relevance.matches[0].similarity, 1);
  assert.equal(relevance.matches[0].direction, "outgoing"); assert.equal(original.nodes[1].relevance, undefined);
  assert.deepEqual((await analyzer.analyze(result, node.id, reason, signal())).nodes[1].relevance, relevance);
  assert.equal(models, 1); assert.equal(embeds, 1);
  const moved = moveRelations(result, [{ node: node.id, parent: result.nodes[0].id }]);
  assert.equal(moved.nodes[1].relevance, undefined); assert.equal(moved.budget.spent, original.budget.spent);
  const bad: Reasoner = async () => ({ matches: [{ ...relevance.matches[0], target: "foreign-node" }] });
  assert.equal((await analyzer.analyze(original, node.id, bad, signal())).nodes[1].relevance!.status, "unavailable");
  assert.throws(() => parseClassification({ matches: [{ ...relevance.matches[0], direction: "undirected" }] }), /方向/);
});

test("未配置、网络失败和取消有明确边界，不用伪造向量替代", async () => {
  const original = tree(), id = original.nodes[1].id;
  const never: Reasoner = async () => { throw new Error("不应调用分类模型"); };
  assert.equal((await new RelevanceAnalyzer(() => undefined).analyze(original, id, never, signal())).nodes[1].relevance!.status, "unconfigured");
  const failed = new RelevanceAnalyzer(() => ({ ...provider(), embed: async () => { throw new Error("network"); } }));
  assert.equal((await failed.analyze(original, id, never, signal())).nodes[1].relevance!.status, "unavailable");
  const abort = new AbortController(); abort.abort();
  await assert.rejects(new RelevanceAnalyzer(provider).analyze(original, id, classify, abort.signal), /aborted/);
});

test("组件分析写入同一数据库，拒绝过期版本并保留原父子树和实验预算", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-relevance-"));
  const context = createTaskContextForDataDir(dir);
  let gate: (() => Promise<void>) | undefined;
  const service = new ResearchService(context, createMemoryContextForDataDir(dir).service, () => async (...args) => { await gate?.(); return classify(...args); }, new RelevanceAnalyzer(provider));
  try {
    const task = context.store.create({ cwd: "/project", sessionId: "relevance", title: "研究", source: "task" });
    context.store.update(task.id, (state) => { state.mode = "research"; state.autonomy = { schemaVersion: 1, goal: "提升模型精度", phase: "PAUSED", cycle: 0, maxCycles: 20, reason: "暂停", permissions: { commands: [], writeRoots: [] }, decision: tree() }; });
    const node = task.autonomy!.decision!.nodes[1], parent = node.parent, budget = structuredClone(task.autonomy!.decision!.budget);
    const graph = service.graph(task.id);
    await graph.client().relate(node.id, task.lastEventSeq);
    const saved = new TaskStore({ dataDir: dir }).get(task.id)!.autonomy!.decision!;
    assert.equal(saved.nodes[1].relevance!.status, "ready"); assert.equal(saved.nodes[1].parent, parent); assert.deepEqual(saved.budget, budget);
    await assert.rejects(graph.client().relate(node.id, task.lastEventSeq - 1), /GRAPH_CONFLICT/);
    await assert.rejects(graph.client().relate("missing", task.lastEventSeq), /不存在/);
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((done) => { entered = done; });
    const hold = new Promise<void>((done) => { release = done; });
    gate = () => { entered(); return hold; };
    const pending = graph.client().relate(task.autonomy!.decision!.nodes[0].id, task.lastEventSeq);
    await waiting;
    await assert.rejects(graph.client().relate(node.id, task.lastEventSeq), /GRAPH_BUSY/);
    await context.hub.emit(task.id, "task_updated", task);
    release();
    await assert.rejects(pending, /GRAPH_CONFLICT/);
    assert.equal(task.autonomy!.decision!.nodes[0].relevance, undefined);
  } finally { await service.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("科研规划自动分析当前节点，等待时保存建议而不执行额外实验", { timeout: 5000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-relevance-loop-"));
  const context = createTaskContextForDataDir(dir);
  let classifications = 0;
  const reason: Reasoner = async (phase, input, abort) => {
    if (phase === "relate") { classifications++; return classify(phase, input, abort); }
    if (phase === "decide") return { decision: "select", reason: "核对训练", candidates: [{ key: "train", parent: "mission", objective: "训练模型", kind: "execute", confidence: 1, expected_gain: 1, cost: 0.1 }], mission_condition: { kind: "file_exists", path: "report.json" } };
    return { decision: "wait", reason: "等待实验数据", steps: [], observe_paths: [] };
  };
  const service = new ResearchService(context, createMemoryContextForDataDir(dir).service, () => reason, new RelevanceAnalyzer(provider));
  try {
    const waited = new Promise<void>((done) => {
      const stop = context.hub.subscribeGlobal((event) => {
        if (context.store.get(event.taskId)?.autonomy?.phase === "WAITING") { stop(); done(); }
      });
    });
    const task = await service.create(dir, "提升模型精度", undefined, {});
    await waited;
    assert.equal(classifications, 1);
    assert.equal(task.autonomy!.decision!.nodes[0].relevance?.status, "ready");
    assert.equal(task.autonomy!.decision!.budget.spent, 0);
    assert.equal(task.autonomy!.jobId, undefined);
  } finally { await service.close(); rmSync(dir, { recursive: true, force: true }); }
});
