/* 自主闭环的核心验收：真实作业、事件等待、权限、中断恢复和取消。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../src/plugins/memory/index.js";
import { ResearchService } from "../src/research/service.js";
import { JobExecutor } from "../src/research/executor.js";
import { planAuthorized } from "../src/research/core.js";
import { projectPath, evaluate } from "../src/research/project.js";
import { parsePlan } from "../src/research/validation.js";
import type { Reasoner } from "../src/research/reasoner.js";
import type { Condition, Plan, ResearchPhase, Result } from "../src/research/types.js";
import type { TaskState } from "../src/task/types.js";

const condition = { kind: "metric" as const, path: ".lin/experiments/metrics.json", key: "accuracy", operator: ">=" as const, value: 0.93 };
const learning = { summary: "指标已通过实测条件，原因仍需后续实验验证", knowledge_update: [{ key: "accuracy", value: "本轮观测到 0.934" }], next_question: "独立数据是否可复现？" };
async function fixture(reasoner: Reasoner, missionCondition: Condition = condition, strategy?: Reasoner) {
  const root = await mkdtemp(join(tmpdir(), "yf-research-"));
  await mkdir(join(root, "project/.lin/experiments"), { recursive: true });
  const cwd = await realpath(join(root, "project"));
  const context = createTaskContextForDataDir(join(root, "data"));
  const memory = createMemoryContextForDataDir(join(root, "data")).service;
  const selectedModels: (TaskState["model"])[] = [];
  const service = new ResearchService(context, memory, (_cwd, model) => {
    selectedModels.push(model);
    return async (phase, data, signal) => {
      if (phase !== "decide") return reasoner(phase, data, signal);
      if (strategy) return strategy(phase, data, signal);
      return { decision: "select", reason: "先核验目标", mission_condition: missionCondition, candidates: [{ key: "verify", parent: "mission", objective: "核验本地实验", kind: "execute", confidence: 0.9, cost: 0.1, expected_gain: 0.8 }] };
    };
  });
  const phase = (expected: ResearchPhase) => new Promise<TaskState>((resolve) => {
    const stop = context.hub.subscribeGlobal((event) => {
      const state = context.store.get(event.taskId)!;
      if (state.autonomy?.phase === expected) { stop(); resolve(state); }
    });
  });
  return { root, cwd, context, memory, service, phase, selectedModels, close: async () => { await service.close(); await rm(root, { recursive: true, force: true }); } };
}

test("真实实验完成事件驱动反思、候选记忆和下一轮实测验收", { timeout: 10000 }, async () => {
  let decisions = 0;
  const phases: ResearchPhase[] = [];
  const program = process.execPath;
  const args = ["-e", "require('node:fs').writeFileSync('.lin/experiments/metrics.json', JSON.stringify({accuracy:0.934}))"];
  const ctx = await fixture(async (phase) => phase === "reflect" ? learning : {
    decision: ++decisions === 1 ? "act" : "complete", reason: "用项目结果核验指标",
    steps: decisions === 1 ? [{ action: "run_command", program, args }] : [], success_condition: condition,
  });
  ctx.context.hub.subscribeGlobal((e) => { const p = ctx.context.store.get(e.taskId)?.autonomy?.phase; if (p) phases.push(p); });
  try {
    const completed = ctx.phase("COMPLETED");
    const task = await ctx.service.create(ctx.cwd, "accuracy 至少 0.93", undefined, { permissions: { commands: [{ program, args }] } });
    const state = await completed;
    assert.equal(state.id, task.id);
    assert.equal(state.autonomy!.lastResult!.evaluation!.actual, 0.934);
    assert.ok(phases.includes("WAITING") && phases.includes("REFLECTING"));
    assert.equal(decisions, 1);
    assert.equal(state.autonomy!.decision!.nodes[0]!.status, "succeeded");
    assert.equal(ctx.memory.list({ projectKey: ctx.cwd })[0]?.confidence, "candidate");
    assert.equal(JSON.parse(await readFile(join(ctx.cwd, condition.path), "utf8")).accuracy, 0.934);
    assert.ok(ctx.service.conversation(task.id).context.messages.length >= 5);
  } finally { await ctx.close(); }
});

test("等待期间不轮询模型，文件事件唤醒后继续验收", { timeout: 10000 }, async () => {
  let plans = 0;
  const ctx = await fixture(async (phase, context) => {
    if (phase === "reflect") return learning;
    plans += 1;
    const hasMetrics = (context as { state: { facts: { key: string; value: unknown }[] } }).state.facts.some((f) => f.key === `file:${condition.path}` && typeof f.value === "string");
    return { decision: hasMetrics ? "complete" : "wait", reason: "等待实验结果文件", steps: [], ...(hasMetrics ? { success_condition: condition } : {}), observe_paths: [condition.path] };
  });
  try {
    const waiting = ctx.phase("WAITING");
    await ctx.service.create(ctx.cwd, "核验外部实验", undefined, {});
    await waiting;
    assert.equal(plans, 1);
    const completed = ctx.phase("COMPLETED");
    await writeFile(join(ctx.cwd, condition.path), JSON.stringify({ accuracy: 0.934 }));
    await completed;
    assert.equal(plans, 1);
  } finally { await ctx.close(); }
});

test("执行前阻断越界、链接和未授权命令，不将字符串指标视为达标", { timeout: 10000 }, async () => {
  const ctx = await fixture(async () => ({ decision: "wait", reason: "等待", steps: [] }));
  try {
    const task = await ctx.service.create(ctx.cwd, "实验", undefined, {});
    const plan: Plan = { decision: "act", reason: "尝试命令", steps: [{ action: "run_command", program: "node", args: ["-e", "0"] }], success_condition: condition };
    assert.equal(await planAuthorized(task, plan), false);
    await assert.rejects(projectPath(ctx.cwd, "../outside"), /越界/);
    await symlink(ctx.root, join(ctx.cwd, "link"));
    await assert.rejects(projectPath(ctx.cwd, "link/result.json"), /符号链接/);
    await writeFile(join(ctx.cwd, condition.path), '{"accuracy":"0.99"}');
    assert.equal((await evaluate(ctx.cwd, condition)).passed, false);
    assert.throws(() => parsePlan({ decision: "act", reason: "无验收", steps: plan.steps }), /验收/);
    assert.throws(() => parsePlan({ ...plan, steps: [{ action: "write_file", path: "large.txt", content: "中".repeat(30000) }] }), /过长/);
  } finally { await ctx.close(); }
});

test("重启后未知作业暂停，继续时反思中断结果而不重放命令", { timeout: 10000 }, async () => {
  let reflections = 0;
  const ctx = await fixture(async (phase, data) => {
    if (phase === "reflect") { reflections += 1; assert.equal((data as { result: Result }).result.status, "interrupted"); return learning; }
    return { decision: "wait", reason: "核对已有实验文件", steps: [] };
  });
  try {
    const state = ctx.context.store.create({ sessionId: "research-restart", cwd: ctx.cwd, title: "恢复", source: "task" });
    ctx.context.store.update(state.id, (s) => { s.mode = "research"; s.autonomy = { schemaVersion: 1, goal: "恢复实验", phase: "WAITING", cycle: 1, maxCycles: 20, reason: "执行中", jobId: "old-job", permissions: { commands: [], writeRoots: [".lin/experiments"] } }; });
    ctx.service.recover();
    assert.equal(state.autonomy?.phase, "PAUSED");
    assert.equal(state.autonomy?.result?.status, "interrupted");
    const waiting = ctx.phase("WAITING");
    await ctx.service.command(state.id, { type: "retry" });
    await waiting;
    assert.equal(reflections, 1);
    assert.equal(state.autonomy?.jobId, undefined);
  } finally { await ctx.close(); }
});

test("未授权计划展示具体步骤，批准后只执行一次，旧授权不能复用", { timeout: 10000 }, async () => {
  let decisions = 0;
  const ctx = await fixture(async (phase) => phase === "reflect" ? learning : {
    decision: ++decisions === 1 ? "act" : "complete", reason: "生成项目报告",
    steps: decisions === 1 ? [{ action: "write_file", path: "report.json", content: '{"accuracy":0.934}' }] : [],
    success_condition: { ...condition, path: "report.json" },
  }, { ...condition, path: "report.json" });
  try {
    const requested = new Promise<TaskState>((resolve) => {
      const stop = ctx.context.hub.subscribeGlobal((e) => {
        const task = ctx.context.store.get(e.taskId)!;
        if (task.autonomy?.approvalId) { stop(); resolve(task); }
      });
    });
    await ctx.service.create(ctx.cwd, "生成并核对报告", undefined, {});
    const task = await requested;
    const requestId = task.autonomy!.approvalId!;
    assert.match(ctx.context.store.listInterventions(task.id)[0]!.message, /accuracy/);
    await assert.rejects(readFile(join(ctx.cwd, "report.json")), { code: "ENOENT" });
    const completed = ctx.phase("COMPLETED");
    assert.equal(await ctx.service.resolve(task.id, requestId, true), true);
    await completed;
    assert.equal(await ctx.service.resolve(task.id, requestId, true), false);
    assert.equal(task.autonomy!.authorizedPlan, undefined);
    assert.equal(JSON.parse(await readFile(join(ctx.cwd, "report.json"), "utf8")).accuracy, 0.934);
  } finally { await ctx.close(); }
});

test("取消真实长作业后回收进程并产生取消结果", { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-job-"));
  const jobs = new JobExecutor();
  const marker = join(root, "pid.json");
  let watcher: ReturnType<typeof watch>;
  const changed = new Promise<void>((resolve) => { watcher = watch(root, (_event, filename) => { if (String(filename) === "pid.json") { watcher.close(); resolve(); } }); });
  let finish!: (result: Result) => void;
  const result = new Promise<Result>((resolve) => { finish = resolve; });
  try {
    jobs.start("long", root, { decision: "act", reason: "取消验收", steps: [{ action: "run_command", program: process.execPath, args: ["-e", "const fs=require('node:fs');fs.writeFileSync('.pid.tmp',String(process.pid));fs.renameSync('.pid.tmp','pid.json');setInterval(()=>{},1000)"] }], success_condition: { kind: "file_exists", path: "pid.json" } }, async (value) => finish(value));
    await changed;
    const pid = Number(await readFile(marker, "utf8"));
    assert.ok(pid > 0);
    await jobs.cancel("long");
    assert.equal((await result).status, "cancelled");
    assert.throws(() => process.kill(pid, 0));
  } finally { watcher!.close(); await jobs.close(); await rm(root, { recursive: true, force: true }); }
});

test("子任务达标后滚动选择下一节点，长期指标达标才结束", { timeout: 10000 }, async () => {
  let decisions = 0, plans = 0;
  const ctx = await fixture(async (phase, data) => {
    if (phase === "reflect") return learning;
    plans += 1;
    const objective = (data as { node: { objective: string } }).node.objective;
    const verify = objective === "清洗标签";
    return { decision: verify ? "complete" : "act", reason: objective, steps: verify ? [] : [{ action: "write_file", path: condition.path, content: '{"accuracy":0.934}' }], success_condition: { ...condition, value: verify ? 0.9 : 0.93 }, mission_complete: true };
  }, condition, async () => {
    decisions += 1;
    return { decision: "select", reason: "按收益与成本选择一个局部任务", mission_condition: condition, candidates: [
      { key: "clean", parent: "mission", objective: "清洗标签", kind: "explore", confidence: 0.9, cost: 0.1, expected_gain: 1 },
      { key: "train", parent: "mission", objective: "调整训练配置", kind: "execute", confidence: 0.8, cost: 0.1, expected_gain: 0.8 },
    ] };
  });
  try {
    await writeFile(join(ctx.cwd, condition.path), '{"accuracy":0.91}');
    const completed = ctx.phase("COMPLETED");
    const executionModel = { provider: "local", modelId: "executor" };
    const decisionModel = { provider: "local", modelId: "decision-small" };
    await ctx.service.create(ctx.cwd, "accuracy 至少 0.93", executionModel, { decisionModel });
    const task = await completed;
    assert.equal(decisions, 2); assert.equal(plans, 2);
    assert.equal(task.autonomy!.cycle, 3);
    assert.deepEqual(task.autonomy!.decision!.nodes.map((n) => n.status), ["succeeded", "succeeded"]);
    assert.equal(task.autonomy!.decision!.budget.spent, 0.1);
    assert.equal(task.autonomy!.lastResult!.evaluation!.actual, 0.934);
    assert.equal(task.autonomy!.plan!.mission_complete, true);
    assert.deepEqual(ctx.selectedModels, [executionModel, decisionModel]);
    const persisted = JSON.parse(await readFile(join(ctx.root, "data/tasks", task.id, "state.json"), "utf8"));
    assert.equal(persisted.autonomy.decision.budget.spent, 0.1);
    assert.equal(persisted.autonomy.decision.nodes[0].attempts, 1);
    assert.deepEqual(persisted.autonomy.decision.horizon, []);
  } finally { await ctx.close(); }
});

test("连续失败耗尽节点尝试后暂停，模型重新提案不能重置次数", { timeout: 10000 }, async () => {
  let plans = 0;
  const ctx = await fixture(async (phase) => {
    if (phase === "reflect") return learning;
    plans += 1;
    return { decision: "act", reason: "核验失败尝试", steps: [{ action: "write_file", path: condition.path, content: '{"accuracy":0.8}' }], success_condition: condition };
  });
  try {
    const paused = ctx.phase("PAUSED");
    await ctx.service.create(ctx.cwd, "accuracy 至少 0.93", undefined, {});
    const task = await paused;
    assert.equal(plans, 2);
    assert.equal(task.autonomy!.decision!.nodes[0]!.attempts, 2);
    assert.equal(task.autonomy!.decision!.nodes[0]!.status, "blocked");
    assert.equal(task.autonomy!.decision!.budget.spent, 0.2);
    assert.equal(task.autonomy!.phase, "PAUSED");
  } finally { await ctx.close(); }
});

test("实际 Pi 决策使用 Lin 配置，模型请求没有工具且不加载项目扩展", { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-pi-research-"));
  const agentDir = join(root, ".lin/agent"), cwd = join(root, "project");
  const requests: Record<string, unknown>[] = [];
  const endpoint = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body); requests.push(data);
    const last = data.messages.at(-1).content;
    const context = JSON.parse(typeof last === "string" ? last : last.map((part: { text?: string }) => part.text ?? "").join(""));
    const content = JSON.stringify(context.phase === "decide" ? { decision: "wait", reason: "等待候选事实", candidates: [] } : context.phase === "plan" ? { decision: "wait", reason: "等待真实项目事件", steps: [] } : learning);
    const frame = (delta: object, finish_reason: string | null) => `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", created: 0, model: "research-local", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(frame({ role: "assistant", content }, null) + frame({}, "stop") + "data: [DONE]\n\n");
  });
  try {
    await mkdir(join(agentDir, "extensions"), { recursive: true });
    await mkdir(join(cwd, ".lin/extensions"), { recursive: true });
    const marker = join(root, "extension-ran");
    const extension = `import { writeFileSync } from 'node:fs'; export default () => writeFileSync(${JSON.stringify(marker)}, 'unexpected');`;
    await writeFile(join(agentDir, "extensions/marker.js"), extension);
    await writeFile(join(cwd, ".lin/extensions/marker.js"), extension);
    await writeFile(join(cwd, "AGENTS.md"), "UNTRUSTED_PROJECT_CONTEXT_MARKER");
    await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
    const port = (endpoint.address() as { port: number }).port;
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { researchlocal: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "local-test-only", models: [{ id: "research-local", contextWindow: 32000, maxTokens: 4000 }] } } }));
    const script = `
      import assert from 'node:assert/strict';
      import { piReasoner } from './src/research/reasoner.ts';
      const reason = piReasoner(${JSON.stringify(cwd)}, { provider: 'researchlocal', modelId: 'research-local' });
      assert.equal((await reason('decide', { goal: '局部决策' }, AbortSignal.timeout(15000))).decision, 'wait');
      assert.equal((await reason('plan', { goal: '本地验收' }, AbortSignal.timeout(15000))).decision, 'wait');
      assert.ok((await reason('reflect', { result: { status: 'succeeded' } }, AbortSignal.timeout(15000))).summary);
      console.log('pi-research-isolation-ok');
    `;
    const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: new URL("../", import.meta.url), env: { ...process.env, YUNFENG_AGENT_DIR: agentDir, YUNFENG_DATA_DIR: join(root, "data") }, timeout: 35000 });
    assert.match(child.stdout, /pi-research-isolation-ok/);
    assert.equal(requests.length, 3);
    for (const request of requests) {
      assert.ok(!request.tools || (request.tools as unknown[]).length === 0);
      assert.ok(!JSON.stringify(request).includes("UNTRUSTED_PROJECT_CONTEXT_MARKER"));
    }
    await assert.rejects(readFile(marker), { code: "ENOENT" });
  } finally { endpoint.closeAllConnections(); await new Promise<void>((resolve) => endpoint.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
