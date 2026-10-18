/* 实际 Pi SDK 与本地实验 Runtime 的隔离验收入口。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createTaskContextForDataDir } from "../../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../../src/plugins/memory/index.js";
import { ResearchService } from "../../src/research/service.js";
import { piReasoner } from "../../src/research/reasoner.js";
import { PiResearchBridge } from "../../src/research/hooks/pi-bridge.js";
import { HookLayer } from "../../src/research/hooks/layer.js";
import type { ResearchEvent } from "../../src/research/hooks/types.js";

const cwd = process.argv[2]!, dataDir = process.argv[3]!;
const model = { provider: "researchlocal", modelId: "research-local" };
const context = createTaskContextForDataDir(dataDir);
const memory = createMemoryContextForDataDir(dataDir).service;
const service = new ResearchService(context, memory);
const received: ResearchEvent[] = [];
const checkpoint = { schemaVersion: 1 as const, goal: "probe", phase: "WAITING" as const, cycle: 0, maxCycles: 20, reason: "probe", permissions: { commands: [], writeRoots: [] } };
const hooks = new HookLayer(() => checkpoint, () => true, () => { throw new Error("生命周期不能唤醒模型"); });
const bridge = new PiResearchBridge("probe", () => ["control.json"], (event) => { received.push(event); return hooks.publish(event); });
async function waitFor(id: string, predicate: (task: NonNullable<ReturnType<typeof context.store.get>>) => boolean) {
  const signal = AbortSignal.timeout(15000);
  while (!predicate(context.store.get(id)!)) {
    const task = context.store.get(id)!;
    if (task.autonomy?.phase === "FAILED") throw new Error(task.autonomy.reason);
    await delay(15, undefined, { signal });
  }
}
try {
  await piReasoner(cwd, model, { skills: ["gzip-study"], bridge })("decide", { probe: true }, AbortSignal.timeout(10000));
  assert.deepEqual(received.map((event) => event.kind === "pi_extension" && event.action), ["agent_start", "agent_settled"]);
  assert.equal(hooks.pendingCount, 0);
  assert.equal(new Set(received.map((event) => event.kind === "pi_extension" && event.sessionId)).size, 1);
  const task = await service.create(cwd, "以实际源码测量 gzip，压缩率提升至少 1%，解压字节一致；基线完成后等人工复核再优化", model,
    { skills: ["gzip-study"], permissions: { commands: [{ program: process.execPath, args: ["benchmark.mjs"] }] } });
  await waitFor(task.id, (t) => t.autonomy?.phase === "WAITING" && !t.autonomy.jobId);
  await waitFor(task.id, (t) => t.autonomy?.phase === "WAITING" && Boolean(t.autonomy.observation?.facts.some((f) => f.key === "file:control.json")));
  const cycle = task.autonomy!.cycle;
  const sequence = task.lastEventSeq;
  assert.equal(service.notify(task.id, ["control.json"]), true);
  await delay(200);
  assert.equal(task.autonomy!.cycle, cycle, "未变化的扩展通知不得调用模型");
  assert.equal(task.lastEventSeq, sequence, "同事实通知不得写检查点或推送阶段变化");
  assert.equal(service.notify(task.id, [".env"]), false);
  await writeFile(join(cwd, "control.json"), '{"ready":true,"reviewApproved":false}');
  assert.equal(service.notify(task.id, ["control.json"]), true);
  await waitFor(task.id, (t) => t.autonomy?.phase === "WAITING" && !t.autonomy.jobId && Boolean(t.autonomy.lastResult));
  const baseline = JSON.parse(await readFile(join(cwd, ".lin/experiments/baseline.json"), "utf8"));
  assert.equal(baseline.roundtrip, true);
  assert.ok(baseline.bytes > 0);
  assert.ok(task.autonomy!.learning?.summary);
  const baselineCycle = task.autonomy!.cycle;
  await delay(200);
  assert.equal(task.autonomy!.cycle, baselineCycle, "SDK 自身生命周期不得反复规划");
  await service.pause(task.id, "人工复核");
  assert.equal(service.notify(task.id, ["control.json"]), false);
  await service.close();
  const restoredContext = createTaskContextForDataDir(dataDir);
  const restored = new ResearchService(restoredContext, memory);
  try {
    const saved = restoredContext.store.get(task.id)!;
    assert.deepEqual(saved.autonomy!.skills, ["gzip-study"]);
    assert.equal(saved.autonomy!.phase, "PAUSED");
    await writeFile(join(cwd, "control.json"), '{"ready":true,"reviewApproved":true}');
    await restored.resume(task.id);
    const signal = AbortSignal.timeout(15000);
    const currentPhase = () => saved.autonomy!.phase;
    while (currentPhase() !== "COMPLETED") {
      if (["FAILED", "PAUSED"].includes(saved.autonomy!.phase)) throw new Error(saved.autonomy!.reason);
      await delay(15, undefined, { signal });
    }
    const report = JSON.parse(await readFile(join(cwd, ".lin/experiments/report.json"), "utf8"));
    assert.equal(report.completed, 1); assert.equal(report.roundtrip, true); assert.ok(report.improvement >= 1);
    assert.equal(saved.autonomy!.component!.result!.evaluation!.passed, true);
    assert.equal((await readFile(join(cwd, "runs.log"), "utf8")).trim(), "baseline\noptimize");
    assert.ok(saved.autonomy!.decision!.nodes.every((node) => node.attempts === 1));
    console.log(JSON.stringify({ status: "sdk-research-loop-ok", baseline: baseline.bytes, optimized: report.bytes, improvement: report.improvement, cycles: saved.autonomy!.cycle }));
  } finally { await restored.close(); }
} finally { bridge.close(); hooks.close(); await service.close(); }
