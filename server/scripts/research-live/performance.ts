/* 科研本地热路径基准：隔离模型网络，实测通知、执行、观察和持久化。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir, cpus, platform, arch } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { TaskStore } from "../../src/task/task-store.js";
import { TaskEventHub } from "../../src/task/task-event-hub.js";
import { JobExecutor } from "../../src/research/executor.js";
import { observeProject } from "../../src/research/project.js";
import { researchResources } from "../../src/research/resources.js";
import { ResearchModelEnvironment } from "../../src/research/model-environment.js";
import { HookLayer } from "../../src/research/hooks/layer.js";
import { PiResearchBridge } from "../../src/research/hooks/pi-bridge.js";
import { createDecision } from "../../src/research/decision/engine.js";
import type { ResearchCheckpoint, Result, Step } from "../../src/research/types.js";

const output = process.argv[2];
if (!output) throw new Error("需要输出 JSON 文件路径");
const root = await mkdtemp(join(tmpdir(), "yf-research-perf-"));
const cwd = join(root, "project"), agentDir = join(root, "agent");
const results: Record<string, { coldMs: number; p50Ms: number; p95Ms: number; samples: number }> = {};
async function measure(name: string, work: () => Promise<unknown> | unknown, samples = 30) {
  const values: number[] = [];
  for (let i = 0; i <= samples; i += 1) { const start = performance.now(); await work(); values.push(performance.now() - start); }
  const coldMs = values.shift()!; values.sort((a, b) => a - b);
  results[name] = { coldMs, p50Ms: values[Math.floor(values.length * .5)]!, p95Ms: values[Math.floor(values.length * .95)]!, samples };
}
try {
  await mkdir(join(cwd, ".lin/experiments"), { recursive: true }); await mkdir(agentDir);
  await mkdir(join(cwd, ".agents/skills/method"), { recursive: true });
  await writeFile(join(cwd, ".agents/skills/method/SKILL.md"), "---\nname: method\ndescription: Bounded performance fixture\n---\n" + "Local experiment method.\n".repeat(600));
  await writeFile(join(cwd, "control.json"), '{"ready":false}');
  await writeFile(join(cwd, ".lin/experiments/report.json"), '{"completed":1}');
  await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { perf: { api: "openai-completions", apiKey: "local-fixture-only", baseUrl: "http://127.0.0.1:1/v1", models: [{ id: "fixture", contextWindow: 32000, maxTokens: 4000 }] } } }));
  const checkpoint: ResearchCheckpoint = { schemaVersion: 1, goal: "本地性能", phase: "WAITING", cycle: 0, maxCycles: 20, reason: "测量", permissions: { writeRoots: [], commands: [] } };
  let deliver: (() => void) | undefined;
  const hooks = new HookLayer(() => checkpoint, () => true, () => { deliver?.(); return true; });
  const bridge = new PiResearchBridge("perf", () => ["control.json"], (event) => hooks.publish(event));
  const keepAlive = setInterval(() => {}, 1000); // Hook 的定时器 unref，基准需要保持宿主存活。
  try { await measure("piNotification", () => new Promise<void>((resolve) => { deliver = resolve; assert.equal(bridge.notify(["control.json"]), true); })); }
  finally { clearInterval(keepAlive); bridge.close(); hooks.close(); }
  await measure("observeProject", () => observeProject(cwd, ["control.json"], [], []));
  await measure("resources", () => researchResources(cwd, agentDir, "plan", "Return JSON", { skills: ["method"] }));
  const modelEnvironment = new ResearchModelEnvironment(cwd, agentDir);
  await measure("modelRuntime", () => modelEnvironment.get(new AbortController().signal), 10);
  const store = new TaskStore({ dataDir: join(root, "data") });
  const task = store.create({ cwd, sessionId: "perf", title: "perf", source: "task" });
  store.update(task.id, (s) => {
    s.mode = "research"; s.autonomy = { ...checkpoint, decision: createDecision("本地性能") };
    s.autonomy.decision!.nodes = Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, parent: "mission", objective: `实验 ${i}`, kind: "execute", priority: .5, confidence: .9, cost: .1, expected_gain: .8, status: "pending", attempts: 0 }));
  });
  await measure("checkpoint100Nodes", () => store.update(task.id, (s) => { s.autonomy!.reason = `更新 ${Math.random()}`; }));
  const hub = new TaskEventHub(store);
  await measure("event100Nodes", () => hub.emit(task.id, "task_updated", { phase: "WAITING" }));
  const jobs = new JobExecutor();
  let job = 0;
  const run = (steps: Step[]) => new Promise<void>((resolve, reject) => {
    jobs.start(`job-${job++}`, cwd, { decision: "act", reason: "measure", steps, success_condition: { kind: "file_exists", path: ".lin/experiments/report.json" } }, async (result: Result) => {
      result.status === "succeeded" ? resolve() : reject(new Error(result.output));
    });
  });
  try {
    await measure("executeWrite", () => run([{ action: "write_file", path: ".lin/experiments/config.json", content: "{}" }]));
    await measure("executeProcess", () => run([{ action: "run_command", program: process.execPath, args: ["-e", "process.stdout.write('ok')"] }]), 15);
  } finally { await jobs.close(); }
  const report = { environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, results };
  await writeFile(resolve(output), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await rm(root, { recursive: true, force: true }); }
