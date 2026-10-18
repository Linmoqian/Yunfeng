/* 关系数据库迁移、事务恢复、Agent 调整与任务接口的核心回归。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TaskStore, statePath } from "../src/task/task-store.js";
import { TaskEventHub } from "../src/task/task-event-hub.js";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";
import { ResearchService } from "../src/research/service.js";
import { createDecision, decide } from "../src/research/decision/engine.js";
import { parseProposal } from "../src/research/decision/proposal.js";
import { moveRelations } from "../src/research/decision/relations.js";

function seed(store: TaskStore) {
  const task = store.create({ cwd: "/project", sessionId: "research-test", title: "研究", source: "task" });
  const decision = decide(createDecision("研究"), parseProposal({ decision: "wait", reason: "等待事实", candidates: [
    { key: "group", parent: "mission", objective: "数据", kind: "group", confidence: 1, cost: 0, expected_gain: 1 },
    { key: "exp", parent: "mission", objective: "实测", kind: "execute", confidence: 1, cost: 0.1, expected_gain: 1 },
  ] }));
  store.update(task.id, (s) => {
    s.mode = "research";
    s.autonomy = { schemaVersion: 1, goal: "研究", phase: "PAUSED", cycle: 1, maxCycles: 20, reason: "暂停", permissions: { commands: [], writeRoots: [] }, decision };
  });
  return task;
}

test("检查点和事件不重写未变节点，事件提交后可恢复，失败不提前通知", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-relations-incremental-"));
  try {
    const store = new TaskStore({ dataDir: dir }), task = seed(store), hub = new TaskEventHub(store);
    const db = new DatabaseSync(join(dir, "research.sqlite"));
    try {
      db.exec(`CREATE TABLE node_writes(kind TEXT);
        CREATE TRIGGER node_insert AFTER INSERT ON research_node BEGIN INSERT INTO node_writes VALUES('insert'); END;
        CREATE TRIGGER node_update AFTER UPDATE ON research_node BEGIN INSERT INTO node_writes VALUES('update'); END;
        CREATE TRIGGER node_delete AFTER DELETE ON research_node BEGIN INSERT INTO node_writes VALUES('delete'); END;`);
      store.update(task.id, (s) => { s.autonomy!.reason = "仅更新阶段"; });
      let delivered = 0;
      let persistedSeq: number | undefined;
      hub.subscribeTask(task.id, () => { delivered += 1; persistedSeq = new TaskStore({ dataDir: dir }).get(task.id)!.lastEventSeq; });
      await hub.emit(task.id, "task_updated", { phase: "WAITING" });
      assert.equal(delivered, 1);
      assert.equal(persistedSeq, task.lastEventSeq);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM node_writes").get()!.count, 0);
      const seq = task.lastEventSeq;
      db.exec("CREATE TRIGGER reject_cursor BEFORE UPDATE ON research_task BEGIN SELECT RAISE(ABORT,'test-write-rejected'); END;");
      await assert.rejects(hub.emit(task.id, "task_updated", {}), /test-write-rejected/);
      assert.equal(task.lastEventSeq, seq); assert.equal(delivered, 1);
      db.exec("DROP TRIGGER reject_cursor");
      store.update(task.id, (s) => { s.autonomy!.decision!.nodes[0]!.objective = "更新单一节点"; });
      assert.deepEqual(db.prepare("SELECT kind FROM node_writes").all().map((row) => row.kind), ["update"]);
      store.update(task.id, (s) => { s.autonomy!.decision!.nodes.pop(); });
      assert.equal(new TaskStore({ dataDir: dir }).get(task.id)!.autonomy!.decision!.nodes.length, 1);
      assert.deepEqual(db.prepare("SELECT kind FROM node_writes").all().map((row) => row.kind), ["update", "delete"]);
    } finally { db.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("旧 JSON 导入数据库后以 SQL 关系为准，失败更新同时回滚内存与数据库", () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-relations-"));
  try {
    const task = seed(new TaskStore({ dataDir: dir }));
    const legacy = structuredClone(task);
    // 模拟升级前仅有 JSON 的目录。
    rmSync(join(dir, "research.sqlite"));
    writeFileSync(statePath(dir, task.id), JSON.stringify(legacy));
    const store = new TaskStore({ dataDir: dir });
    const current = store.get(task.id)!;
    const [group, exp] = current.autonomy!.decision!.nodes;
    store.update(task.id, (s) => { s.autonomy!.decision = moveRelations(s.autonomy!.decision!, [{ node: exp.id, parent: group.id }]); });
    assert.throws(() => store.update(task.id, (s) => { s.autonomy!.decision!.nodes[0].parent = group.id; }), /循环/);
    assert.equal(current.autonomy!.decision!.nodes[0].parent, "mission");
    const restored = new TaskStore({ dataDir: dir }).get(task.id)!;
    assert.equal(restored.autonomy!.decision!.nodes[1].parent, group.id);
    const db = new DatabaseSync(join(dir, "research.sqlite"));
    try {
      const row = db.prepare("SELECT parent,payload FROM research_node WHERE task_id=? AND id=?").get(task.id, exp.id)!;
      assert.equal(row.parent, group.id);
      db.exec("PRAGMA foreign_keys=ON");
      assert.throws(() => db.prepare("UPDATE research_node SET parent=? WHERE task_id=? AND id=?").run("missing-parent", task.id, exp.id), /FOREIGN KEY/);
      assert.equal(JSON.parse(String(row.payload)).parent, undefined);
      assert.equal(JSON.parse(String(db.prepare("SELECT checkpoint FROM research_task WHERE id=?").get(task.id)!.checkpoint)).autonomy.decision.nodes.length, 0);
    } finally { db.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Agent 提案和组件接口调整同一关系，保留实测历史并拒绝冲突及运行中改挂", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yf-relations-api-"));
  const context = createTaskContextForDataDir(dir);
  const memory = createMemoryContextForDataDir(dir).service;
  const service = new ResearchService(context, memory);
  try {
    const task = seed(context.store);
    const tree = task.autonomy!.decision!;
    const [group, exp] = tree.nodes;
    exp.status = "succeeded"; exp.attempts = 1; exp.jobId = "measured";
    exp.result = { job_id: "measured", status: "succeeded", evaluation: { passed: true, reason: "实测通过" } };
    const proposal = parseProposal({ decision: "wait", reason: "按主题整理", candidates: [], relations: [{ node: exp.id, parent: group.id }] });
    const revised = decide(tree, proposal);
    assert.deepEqual(revised.nodes[1], { ...exp, parent: group.id });
    assert.deepEqual(revised.budget, tree.budget);
    const graph = service.graph(task.id);
    const moved = await graph.call({ component: "research-graph", action: "move", node: exp.id, parent: group.id, revision: task.lastEventSeq }) as { revision: number };
    assert.equal(task.autonomy!.decision!.nodes[1].parent, group.id);
    await assert.rejects(graph.call({ component: "research-graph", action: "move", node: exp.id, parent: "mission", revision: moved.revision - 1 }), /GRAPH_CONFLICT/);
    await assert.rejects(graph.call({ component: "research-graph", action: "move", node: "foreign-task-node", parent: group.id, revision: moved.revision }), /不存在/);
    context.store.update(task.id, (s) => { s.autonomy!.phase = "PLANNING"; });
    await assert.rejects(graph.call({ component: "research-graph", action: "move", node: exp.id, parent: "mission", revision: moved.revision }), /GRAPH_BUSY/);
    const running = structuredClone(revised); running.nodes[1].status = "running";
    assert.throws(() => moveRelations(running, [{ node: group.id, parent: exp.id }]), /运行中/);
    assert.throws(() => moveRelations(revised, [{ node: group.id, parent: group.id }]), /循环/);
    assert.equal(new TaskStore({ dataDir: dir }).get(task.id)!.autonomy!.decision!.nodes[1].jobId, "measured");
  } finally { await service.close(); rmSync(dir, { recursive: true, force: true }); }
});
