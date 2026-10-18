/* 科研生命周期竞态与持久化恢复：使用可控模型和真实 TaskStore，不请求远程模型。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Socket } from "node:net";
import { test } from "node:test";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";
import { ResearchService } from "../src/research/service.js";
import { ResearchRuntime } from "../src/research/runtime.js";
import { researchEvent } from "../src/research/hooks/types.js";
import type { TaskState } from "../src/task/types.js";
import type { AgentCore, Plan, ResearchCheckpoint } from "../src/research/types.js";
import type { Reasoner } from "../src/research/reasoner.js";

const waitPlan: Plan = { decision: "wait", reason: "等待外部数据", steps: [] };
const learning = { summary: "结果已核对", knowledge_update: [], next_question: "" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const checkpoint = (): ResearchCheckpoint => ({ schemaVersion: 1, goal: "核验本地项目", phase: "WAITING", cycle: 0, maxCycles: 20, reason: "等待", permissions: { commands: [], writeRoots: [] } });
function seed(context: ReturnType<typeof createTaskContextForDataDir>, cwd: string, patch: Partial<ResearchCheckpoint> = {}) {
  const task = context.store.create({ cwd, sessionId: `research-${Math.random()}`, title: "生命周期验收", source: "task" });
  context.store.update(task.id, (state) => { state.mode = "research"; state.autonomy = { ...checkpoint(), ...patch }; });
  return task;
}
function until(context: ReturnType<typeof createTaskContextForDataDir>, task: TaskState, predicate: () => boolean): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = context.hub.subscribeTask(task.id, () => { if (predicate()) { unsubscribe(); resolve(); } });
  });
}

test("并发继续仅唤醒一次，暂停与继续按顺序收尾，关闭后不接受新生命周期操作", { timeout: 10000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "yf-lifecycle-")));
  const context = createTaskContextForDataDir(join(root, "data"));
  const entered = deferred<void>(), release = deferred<void>();
  let decisions = 0;
  const reason: Reasoner = async () => { if (++decisions === 1) { entered.resolve(); await release.promise; } return { decision: "wait", reason: "等待数据", candidates: [], observe_paths: [] }; };
  const service = new ResearchService(context, createMemoryContextForDataDir(join(root, "data")).service, () => reason);
  const task = seed(context, root, { phase: "PAUSED" });
  try {
    await Promise.all([service.resume(task.id), service.resume(task.id), service.command(task.id, { type: "retry" })]);
    await entered.promise;
    assert.equal(decisions, 1);
    await assert.rejects(service.command(task.id, { type: "compact" }), /不适用/);
    const paused = service.pause(task.id, "人工暂停");
    const resumed = service.resume(task.id);
    release.resolve();
    await Promise.all([paused, resumed]);
    await until(context, task, () => task.autonomy!.phase === "WAITING" && decisions === 2);
    assert.equal(decisions, 2);
    await service.close();
    const before = structuredClone(task);
    await assert.rejects(service.resume(task.id), /服务已停止/);
    await assert.rejects(service.command(task.id, { type: "retry" }), /服务已停止/);
    service.recover();
    assert.deepEqual(task, before);
    assert.equal(decisions, 2);
  } finally { release.resolve(); await service.close(); await rm(root, { recursive: true, force: true }); }
});

test("未知 Rust 作业先等待回收确认，回收失败保持暂停且不启动新决策", { timeout: 10000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "yf-terminal-recovery-")));
  const context = createTaskContextForDataDir(join(root, "data")), first = deferred<Socket>(), second = deferred<Socket>();
  const keys = ["YUNFENG_RESEARCH_NATIVE", "YUNFENG_TERMINAL_PORT", "YUNFENG_TERMINAL_TOKEN"] as const;
  const previous = keys.map((key) => process.env[key]);
  const sockets = new Set<Socket>(), actions: string[] = [];
  const host = createServer((socket) => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.once("data", (data) => {
      const { request } = JSON.parse(String(data));
      actions.push(request.action);
      if (actions.length === 1) first.resolve(socket); else second.resolve(socket);
    });
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address(); assert.ok(address && typeof address !== "string");
  process.env.YUNFENG_RESEARCH_NATIVE = "3"; process.env.YUNFENG_TERMINAL_PORT = String(address.port); process.env.YUNFENG_TERMINAL_TOKEN = "test-only";
  let decisions = 0;
  const service = new ResearchService(context, createMemoryContextForDataDir(join(root, "data")).service, () => async () => { decisions += 1; throw new Error("不得启动新决策"); });
  const task = seed(context, root, { jobId: "native-unknown" });
  try {
    service.recover();
    const firstSocket = await first.promise;
    const resuming = assert.rejects(service.resume(task.id), /TERMINAL_CLEANUP_FAILED/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(actions.length, 1); assert.equal(decisions, 0);
    firstSocket.end('{"result":null}\n');
    const secondSocket = await second.promise;
    secondSocket.end('{"error":{"code":"UNAVAILABLE"}}\n');
    await resuming;
    assert.equal(task.autonomy!.phase, "PAUSED");
    assert.equal(task.autonomy!.result!.status, "interrupted");
    assert.equal(decisions, 0); assert.deepEqual(actions, ["stopJob", "stopJob"]);
  } finally {
    await service.close();
    sockets.forEach((socket) => socket.destroy());
    await new Promise<void>((resolve) => host.close(() => resolve()));
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    await rm(root, { recursive: true, force: true });
  }
});

test("重建服务核对未知作业、授权与已保存结果，重复恢复不重放实验或反思", { timeout: 10000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "yf-checkpoint-")));
  const dataDir = join(root, "data"), first = createTaskContextForDataDir(dataDir);
  const forbidden: Plan = { decision: "act", reason: "旧授权", steps: [{ action: "write_file", path: "must-not-exist.txt", content: "unsafe" }], success_condition: { kind: "file_exists", path: "must-not-exist.txt" } };
  const running = seed(first, root, { jobId: "unknown-job", result: { job_id: "unknown-job", status: "running" }, plan: forbidden, authorizedPlan: JSON.stringify(forbidden) });
  const approved = seed(first, root, { plan: forbidden, authorizedPlan: JSON.stringify(forbidden) });
  const pending = seed(first, root);
  const approval = await first.runtime.createIntervention(pending.id, { kind: "confirm", title: "旧审批", message: "恢复后需重新确认" });
  first.store.update(pending.id, (task) => { task.autonomy!.approvalId = approval.id; });
  const saved = seed(first, root, { jobId: "finished-job", result: { job_id: "finished-job", status: "failed", completedAt: new Date().toISOString() } });
  const archived = seed(first, root, { jobId: "archived-job" });
  first.store.update(archived.id, (task) => { task.status = "archived"; });
  const context = createTaskContextForDataDir(dataDir), reflected: string[] = [];
  const reason: Reasoner = async (phase, data) => {
    if (phase === "reflect") { reflected.push((data as { result: { job_id: string } }).result.job_id); return learning; }
    if (phase === "decide") return { decision: "wait", reason: "等待数据", candidates: [], observe_paths: [] };
    throw new Error("恢复不应重新执行计划");
  };
  const service = new ResearchService(context, createMemoryContextForDataDir(dataDir).service, () => reason);
  try {
    service.recover(); service.recover();
    for (const original of [running, approved, pending]) {
      const task = context.store.get(original.id)!;
      assert.equal(task.autonomy!.phase, "PAUSED"); assert.equal(task.status, "waiting_input");
      assert.equal(task.autonomy!.authorizedPlan, undefined); assert.equal(task.autonomy!.approvalId, undefined);
      assert.ok(context.store.readEvents(task.id).some((event) => event.type === "task_updated"));
    }
    assert.equal(context.store.get(running.id)!.autonomy!.result!.status, "interrupted");
    assert.equal(context.store.listInterventions(pending.id)[0]!.status, "timed_out");
    assert.equal(await service.resolve(pending.id, approval.id, true), false);
    await until(context, context.store.get(saved.id)!, () => !!context.store.get(saved.id)!.autonomy!.learning && context.store.get(saved.id)!.autonomy!.phase === "WAITING");
    assert.deepEqual(reflected, ["finished-job"]);
    assert.equal(context.store.get(archived.id)!.status, "archived");
    assert.equal(context.store.get(archived.id)!.autonomy!.result, undefined);
    const task = context.store.get(running.id)!;
    await Promise.all([service.resume(task.id), service.resume(task.id)]);
    await until(context, task, () => !!task.autonomy!.lastResult && task.autonomy!.phase === "WAITING");
    assert.deepEqual(reflected, ["finished-job", "unknown-job"]);
    assert.equal(task.autonomy!.jobId, undefined);
    await assert.rejects(readFile(join(root, "must-not-exist.txt")), { code: "ENOENT" });
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test("停止发生于授权回读期间时不预留作业；迟到、重复与非终态结果不能覆盖当前作业", { timeout: 10000 }, async () => {
  const task = { autonomy: checkpoint() } as TaskState;
  const authorizing = deferred<void>(), approval = deferred<boolean>(), saves = deferred<void>();
  let executions = 0, messages = 0, blockSave = false;
  const core: AgentCore = { observe: async () => ({ facts: [], events: [], memory: [], constraints: [] }), plan: async () => ({ ...waitPlan, decision: "act" }), execute: async () => { executions += 1; return { job_id: "unexpected", status: "running" }; }, reflect: async () => learning };
  const runtime = new ResearchRuntime(core, { read: () => task, save: async (change) => { if (blockSave) await saves.promise; change(task.autonomy!); }, message: async () => { messages += 1; }, authorize: async () => { authorizing.resolve(); return approval.promise; }, requestApproval: async () => { throw new Error("停止后不得审批"); }, settled: () => {} });
  runtime.trigger([{ hook: "lifecycle", reason: "继续", event: researchEvent({ kind: "lifecycle", action: "resumed" }) }]);
  await authorizing.promise;
  task.autonomy!.phase = "PAUSED";
  const stopping = runtime.stop(); approval.resolve(true); await stopping;
  assert.equal(task.autonomy!.phase, "PAUSED"); assert.equal(task.autonomy!.jobId, undefined); assert.equal(executions, 0);
  task.autonomy!.jobId = "job-a";
  assert.equal(await runtime.receive({ job_id: "job-a", status: "running" }), false);
  blockSave = true;
  const late = runtime.receive({ job_id: "job-a", status: "failed" });
  task.autonomy!.jobId = "job-b"; saves.resolve();
  assert.equal(await late, false);
  const before = messages;
  const results = await Promise.all([runtime.receive({ job_id: "job-b", status: "cancelled" }), runtime.receive({ job_id: "job-b", status: "failed" })]);
  assert.deepEqual(results, [true, false]); assert.equal(messages, before + 1);
  assert.equal(task.autonomy!.result!.status, "cancelled");
});
