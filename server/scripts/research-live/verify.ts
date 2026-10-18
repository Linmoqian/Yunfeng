/* 显式运行的真实模型验收：两个进程分别完成基线与持久化恢复优化。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { gunzipSync } from "node:zlib";
import { createTaskContextForDataDir } from "../../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../../src/plugins/memory/index.js";
import { ResearchService } from "../../src/research/service.js";
import { piReasoner } from "../../src/research/reasoner.js";
import type { ResearchResources } from "../../src/research/resources.js";
import type { TaskState } from "../../src/task/types.js";
import { audit } from "./audit.js";

const root = resolve(process.argv[2] ?? ""), mode = process.argv[3];
if (!process.argv[2] || !["baseline", "optimize"].includes(mode ?? "")) throw new Error("用法：verify.ts <验收目录> baseline|optimize");
if (mode === "baseline" && existsSync(join(root, "task-id.txt"))) throw new Error("该目录已有任务，请检查证据或准备新目录");
if (mode === "optimize" && existsSync(join(root, "result.json"))) throw new Error("该实验已完成，不重复恢复或执行");
const cwd = join(root, "project"), dataDir = join(root, "data");
const context = createTaskContextForDataDir(dataDir);
const memory = createMemoryContextForDataDir(dataDir).service;
const skills = ["gzip-study", "experimental-design"];
const instrumented = new WeakSet<object>();
let calls = 0, requests = 0;
const trace = (name: string, data: object = {}) => appendFileSync(join(root, "trace.jsonl"), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, mode, name, ...data }) + "\n");
function tracked(cwd: string, model?: Parameters<typeof piReasoner>[1], resources: ResearchResources = {}) {
  const bridge = resources.bridge;
  if (bridge && !instrumented.has(bridge)) {
    instrumented.add(bridge);
    const original = bridge.extension.bind(bridge);
    bridge.extension = (phase) => async (pi) => {
      await original(phase)(pi);
      pi.on("agent_start", () => { trace("sdk.agent_start", { phase }); });
      pi.on("agent_settled", () => { trace("sdk.agent_settled", { phase }); });
      pi.on("before_provider_request", (event) => {
        const raw = JSON.stringify(event.payload), payload = event.payload as { model?: string; tools?: unknown[] };
        const metadata = { phase, model: payload.model, selected: raw.includes("SELECTED_GZIP_LIVE_METHOD"),
          scientificSkill: raw.includes("experimental-design"), hidden: raw.includes("HIDDEN_LIVE_SKILL_MUST_NOT_LOAD"), tools: payload.tools?.length ?? 0 };
        requests += 1; trace("provider.request", metadata);
        assert.ok(metadata.selected && metadata.scientificSkill && !metadata.hidden);
        assert.equal(metadata.tools, 0);
      });
      pi.on("after_provider_response", (event) => { trace("provider.response", { phase, status: event.status }); });
    };
  }
  const reason = piReasoner(cwd, model, resources);
  return async (...args: Parameters<typeof reason>) => {
    const [phase] = args; calls += 1;
    const input = args[1] as { state?: { events?: { event?: { kind?: string; action?: string } }[] } };
    trace("reason.start", { phase, call: calls, triggers: input.state?.events?.flatMap((event) => event.event ? [{ kind: event.event.kind, action: event.event.action }] : []) });
    console.log(JSON.stringify({ phase, status: "model-request", call: calls }));
    const value = await reason(...args);
    trace("reason.done", { phase, decision: (value as { decision?: string }).decision });
    return value;
  };
}
const service = new ResearchService(context, memory, tracked);
let task: TaskState | undefined;
async function waitFor(predicate: (task: TaskState) => boolean, label: string) {
  const deadline = Date.now() + 600_000;
  while (!predicate(task!)) {
    const state = task!.autonomy!;
    if (state.phase === "FAILED" || state.phase === "PAUSED" || state.approvalId) throw new Error(`${label}：${state.phase} ${state.reason}`);
    if (Date.now() > deadline) throw new Error(`${label} 超时`);
    await delay(100);
  }
  console.log(JSON.stringify({ status: label, cycle: task!.autonomy!.cycle, calls, requests }));
}
async function quiet(label: string, duration = 3000) {
  const before = { cycle: task!.autonomy!.cycle, calls, requests, log: existsSync(join(cwd, "runs.log")) ? readFileSync(join(cwd, "runs.log"), "utf8") : "" };
  await delay(duration);
  assert.deepEqual({ cycle: task!.autonomy!.cycle, calls, requests, log: existsSync(join(cwd, "runs.log")) ? readFileSync(join(cwd, "runs.log"), "utf8") : "" }, before, label);
  trace("quiet.passed", { label, duration, ...before });
}
try {
  if (mode === "baseline") {
    task = await service.create(cwd, "验证真实源码 gzip：相比 level=1 基线减小至少1%且解压字节一致。以下为本任务的明确实验约束：\n" + readFileSync(join(cwd, "README.md"), "utf8"), undefined,
      { skills, maxCycles: 15, decisionBudget: 3, permissions: { writeRoots: [".lin/experiments/config"], commands: [{ program: process.execPath, args: ["benchmark.mjs"] }] } });
    writeFileSync(join(root, "task-id.txt"), task.id);
    await waitFor((t) => t.autonomy!.phase === "WAITING" && !t.autonomy!.jobId && Boolean(t.autonomy!.observation?.facts.some((f) => f.key === "file:control.json")), "ready=false 等待");
    await quiet("初始等待无轮询");
    for (let i = 0; i < 32; i += 1) assert.equal(service.notify(task.id, ["control.json"]), true);
    assert.equal(service.notify(task.id, [".env"]), false);
    await quiet("32次相同事实通知没有模型调用");
    writeFileSync(join(cwd, "control.json"), JSON.stringify({ ready: true, reviewApproved: false }));
    assert.equal(service.notify(task.id, ["control.json"]), true);
    await waitFor((t) => t.autonomy!.phase === "WAITING" && !t.autonomy!.jobId && Boolean(t.autonomy!.learning) && Boolean(t.autonomy!.decision?.nodes.some((n) => n.status === "succeeded")), "基线执行反思后等待复核");
    assert.equal(readFileSync(join(cwd, "runs.log"), "utf8"), "baseline\n");
    await quiet("Pi 生命周期与重复文件事件不触发重跑");
    await service.pause(task.id, "真实模型验收：工程师复核");
    assert.equal(service.notify(task.id, ["control.json"]), false);
    writeFileSync(join(cwd, "control.json"), JSON.stringify({ ready: true, reviewApproved: true }));
    await quiet("暂停时事实改变不执行");
    trace("pause.persisted", { taskId: task.id, skills: task.autonomy!.skills, cycle: task.autonomy!.cycle });
  } else {
    task = context.store.get(readFileSync(join(root, "task-id.txt"), "utf8"))!;
    assert.equal(task.autonomy!.phase, "PAUSED");
    assert.deepEqual(task.autonomy!.skills, skills);
    assert.equal(readFileSync(join(cwd, "runs.log"), "utf8"), "baseline\n");
    service.recover();
    await quiet("进程重建后暂停状态不自动执行");
    await service.resume(task.id);
    await waitFor((t) => t.autonomy!.phase === "COMPLETED", "恢复后优化并完成整体验收及反思");
    const report = JSON.parse(readFileSync(join(cwd, ".lin/experiments/report.json"), "utf8"));
    assert.equal(report.completed, 1); assert.equal(report.roundtrip, true); assert.ok(report.improvement >= 1);
    assert.equal(task.autonomy!.component!.result!.evaluation!.passed, true);
    assert.equal(readFileSync(join(cwd, "runs.log"), "utf8"), "baseline\noptimize\n");
    const executed = task.autonomy!.decision!.nodes.filter((n) => n.attempts > 0);
    assert.equal(executed.length, 2);
    assert.ok(executed.every((n) => n.attempts === 1 && n.status === "succeeded" && Boolean(n.reflection)));
    for (const stage of ["baseline", "optimize"]) assert.ok(gunzipSync(readFileSync(join(cwd, `.lin/experiments/${stage}.gz`))).equals(readFileSync(join(cwd, "input.txt"))));
    await quiet("完成后无追加执行");
    assert.equal(service.notify(task.id, ["control.json"]), false);
    writeFileSync(join(root, "result.json"), JSON.stringify({ status: "real-model-loop-passed", report, cycles: task.autonomy!.cycle, executed }, null, 2));
  }
  writeFileSync(join(root, `${mode}-checkpoint.json`), JSON.stringify(task, null, 2));
  if (mode === "optimize") console.log(JSON.stringify(audit(root)));
  console.log(JSON.stringify({ status: `${mode}-passed`, cycle: task.autonomy!.cycle, calls, requests }));
} catch (error) {
  if (task) writeFileSync(join(root, `${mode}-failed-checkpoint.json`), JSON.stringify(task, null, 2));
  throw error;
} finally { await service.close(); }
