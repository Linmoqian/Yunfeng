/* 固定复杂流程执行三轮，逐环节记录系统时间戳与单调时钟耗时，无真实 LLM。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { arch, cpus, platform } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ResearchGraphStore } from "../../src/research/decision/store.js";
import { at, lanes, prepareWorkflow, workflow, type Lane } from "./workflow-fixture.js";
import { binary, target, type Reply, type Target } from "./workflow-transport.js";
const exec = promisify(execFile);
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("需要尚不存在的独立输出目录");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sources = ["./workflow-compare.ts", "./workflow-fixture.ts", "./workflow-transport.ts", "./native-worker.mjs", "../../dist/research/project.js", "../../dist/research/executor.js", "../../dist/research/decision/store.js", "../../dist/task/task-store.js", "../../dist/task/task-event-hub.js"];
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async (path) => [path, hash(await readFile(fileURLToPath(new URL(path, import.meta.url))))])));
const binaryHash = hash(await readFile(binary));
// 墙上时间保留可审计日期；耗时用操作系统单调计时器，避免校时使差值跳变。
async function timed<T>(action: () => Promise<T> | T) {
  const startedAt = new Date().toISOString(), wallStartMs = Date.now(), start = process.hrtime.bigint();
  const value = await action();
  const elapsedNs = process.hrtime.bigint() - start;
  return { value, startedAt, endedAt: new Date().toISOString(), wallElapsedMs: Date.now() - wallStartMs, elapsedNs: elapsedNs.toString(), elapsedMs: Number(elapsedNs) / 1e6 };
}
function canonical(value: any): any {
  if (typeof value === "string") { try { return canonical(JSON.parse(value)); } catch { return value; } }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, key === "cwd" ? "fixture" : canonical(value[key])]));
  return value;
}
type Row = Omit<Awaited<ReturnType<typeof timed<Reply>>>, "value"> & { id: string; label: string; execution: string; innerMs?: number; valueHash: string; restart?: { shutdownMs: number; readyMs: number } };
type Run = { round: number; lane: Lane; stages: Row[]; totalElapsedMs: number; measuredStagesMs: number; harnessMs: number };
const runs: Run[] = [], expected = new Map<string, any>();
async function run(round: number, lane: Lane): Promise<Run> {
  const path = join(root, `round-${round}`, lane); await prepareWorkflow(path);
  let instance: Target | undefined;
  const stages: Row[] = [], values = new Map<string, any>(), start = process.hrtime.bigint();
  async function record(id: string, label: string, action: () => Promise<Reply>, restart?: { shutdownMs: number; readyMs: number }) {
    const { value: reply, ...clock } = await timed(action);
    const value = canonical(reply.value), valueHash = hash(JSON.stringify(value));
    if (expected.has(id)) assert.deepEqual(value, expected.get(id), `${lane} round ${round} ${id} parity`);
    else expected.set(id, value);
    values.set(id, reply.value);
    const execution = workflow.find((step) => step.id === id)?.local ? "shared-script" : id.startsWith("lifecycle.") ? "lifecycle" : lane;
    stages.push({ id, label, execution, ...clock, innerMs: reply.innerMs, valueHash, ...(restart ? { restart } : {}) });
  }
  try {
    await record("lifecycle.start", "启动并保存、恢复 100 节点", async () => { instance = await target(lane, path); return { value: { ready: true } }; });
    for (const step of workflow) {
      if (step.restart) {
        const parts = { shutdownMs: 0, readyMs: 0 };
        await record(step.id, step.label, async () => {
          parts.shutdownMs = (await timed(() => instance!.close())).elapsedMs; instance = undefined;
          const ready = await timed(() => target(lane, path, true)); instance = ready.value; parts.readyMs = ready.elapsedMs;
          return { value: { restored: true } };
        }, parts);
      } else await record(step.id, step.label, async () => step.local ? { value: step.local(values) } : instance!.call(step.request!));
    }
    await record("lifecycle.stop", "关闭工作实例", async () => { await instance!.close(); instance = undefined; return { value: null }; });
    const totalElapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    assert.equal(values.get("decide.wait").decision, "wait");
    assert.equal(values.get("decide.baseline").decision, "baseline");
    assert.equal(values.get("decide.optimize").decision, "optimize");
    assert.deepEqual(canonical(values.get("snapshot.pause")), canonical(values.get("snapshot.restore")), "恢复不能重新写入初始任务");
    assert.equal(values.get("snapshot.restore").autonomy.phase, "PAUSED");
    assert.deepEqual(values.get("execute.baseline"), { count: 256, sum: 512, mean: 2, completed: 1 });
    assert.deepEqual(values.get("execute.optimize"), { count: 128, sum: 512, mean: 4, completed: 1 });
    assert.equal(values.get("evaluate.baseline").passed, true); assert.equal(values.get("evaluate.optimize").passed, true);
    assert.equal(values.get("snapshot.final").lastEventSeq, 4);
    const persisted = new ResearchGraphStore(join(path, "data")).readAll()[0];
    assert.deepEqual(canonical(persisted), canonical(values.get("snapshot.final")), "Node 交叉回读数据库");
    const rustRead = JSON.parse((await exec(binary, ["--inspect", path])).stdout);
    assert.deepEqual(canonical(rustRead), canonical(persisted), "Rust 交叉回读数据库");
    const events = (await readFile(join(path, "data/tasks/workflow-task/events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
    assert.deepEqual(events.map((event) => event.data.phase), ["REFLECTING", "PAUSED", "REFLECTING", "COMPLETED"]);
    await writeFile(join(path, "timings.json"), JSON.stringify(stages, null, 2));
    const measuredStagesMs = stages.reduce((sum, stage) => sum + stage.elapsedMs, 0);
    return { round, lane, stages, totalElapsedMs, measuredStagesMs, harnessMs: totalElapsedMs - measuredStagesMs };
  } finally {
    try { await instance?.close(); } finally { await writeFile(join(path, "timings.partial.json"), JSON.stringify(stages, null, 2)); }
  }
}
function stats(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  return { runsMs: values, medianMs: sorted[1]!, minMs: sorted[0]!, maxMs: sorted[2]! };
}
await mkdir(root); // 独立夹具只允许新目录，失败时保留证据供排查。
for (let round = 1; round <= 3; round += 1) {
  const order = [...lanes.slice(round - 1), ...lanes.slice(0, round - 1)];
  for (const lane of order) {
    const result = await run(round, lane); runs.push(result);
    await writeFile(join(root, "runs.partial.json"), JSON.stringify(runs, null, 2));
    console.log(JSON.stringify({ round, lane, stages: result.stages.length, measuredStagesMs: result.measuredStagesMs, totalElapsedMs: result.totalElapsedMs }));
  }
}
assert.equal(hash(await readFile(binary)), binaryHash, "测量期间不能替换 Rust 二进制");
const summary = runs[0]!.stages.map(({ id, label, execution }) => ({ id, label, sharedScript: execution === "shared-script", ...Object.fromEntries(lanes.map((lane) => [lane, stats(runs.filter((r) => r.lane === lane).map((r) => r.stages.find((s) => s.id === id)!.elapsedMs))])) }));
const totals = Object.fromEntries(lanes.map((lane) => [lane, { stages: stats(runs.filter((r) => r.lane === lane).map((r) => r.measuredStagesMs)), workOnly: stats(runs.filter((r) => r.lane === lane).map((r) => r.stages.filter((s) => !s.id.startsWith("lifecycle.")).reduce((sum, s) => sum + s.elapsedMs, 0))), includingHarness: stats(runs.filter((r) => r.lane === lane).map((r) => r.totalElapsedMs)) }]));
const report = { schemaVersion: 1, startedAt: runs[0]!.stages[0]!.startedAt, finishedAt: new Date().toISOString(), rounds: 3, llmCalls: 0, clock: { timestamp: "Date/UTC system wall clock", elapsed: "process.hrtime.bigint OS monotonic nanoseconds", wallElapsed: "Date.now milliseconds; may be zero for short stages" }, environment: { node: process.version, rust: (await exec("rustc", ["--version"])).stdout.trim(), platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, sourceHashes: { ...sourceHashes, rustBinary: binaryHash }, fixedStateTimestamp: at, summary, totals, runs, parity: { allStageValues: true, pausedStateRestored: true, crossDatabaseRead: true, contiguousEvents: true }, scope: "脚本 Hook 输入与固定规则规划/反思；真实本地文件统计、SQLite、事件和实例恢复；不加载 Pi、真实 LLM、真实训练、桌面 UI" };
await writeFile(join(root, "workflow-comparison.json"), JSON.stringify(report, null, 2));
const table = ["# 固定工作流三轮耗时", "", "单位 ms；各环节为三轮中位数。Node 进程内 / Node 管道 / Rust 完整管道。", "", "| 环节 | Node 进程内 | Node 管道 | Rust 管道 |", "| --- | ---: | ---: | ---: |", ...summary.map((s: any) => `| ${s.label}${s.sharedScript ? "（共用脚本）" : ""} | ${s.nodeDirect.medianMs.toFixed(6)} | ${s.nodePipe.medianMs.toFixed(6)} | ${s.rustPipe.medianMs.toFixed(6)} |`), "", ...lanes.map((lane) => `${lane}：环节累计 ${totals[lane]!.stages.medianMs.toFixed(3)} ms；扣除启动/关闭/重建 ${totals[lane]!.workOnly.medianMs.toFixed(3)} ms；含脚本环节间校验 ${totals[lane]!.includingHarness.medianMs.toFixed(3)} ms。`), "", "Node 进程内重建领域实例，两个管道版本退出并重启工作进程。固定规则决策/反思在共用脚本中执行，不代表模型推理。", "", report.scope];
await writeFile(join(root, "workflow-comparison.md"), table.join("\n") + "\n");
console.log(JSON.stringify({ status: "workflow-comparison-passed", output: join(root, "workflow-comparison.json"), totals }));
