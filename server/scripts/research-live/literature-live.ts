/* 显式真实模型与公共文献检索验收，两个进程验证等待、暂停恢复及来源对比。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { createTaskContextForDataDir } from "../../src/task/task-context.js";
import { createMemoryContextForDataDir } from "../../src/plugins/memory/index.js";
import { ResearchService } from "../../src/research/service.js";
import { piReasoner } from "../../src/research/reasoner.js";
import type { TaskState } from "../../src/task/types.js";
import type { LiteratureReport } from "../../src/research/literature/report.js";
const root = resolve(process.argv[2] ?? ""), mode = process.argv[3];
if (!process.argv[2] || !["prepare", "resume"].includes(mode ?? "")) throw new Error("用法：literature-live.ts <新验收目录> prepare|resume");
const cwd = join(root, "project"), dataDir = join(root, "data"), reportPath = ".lin/experiments/literature.json";
const query = "soybean pod detection deep learning";
const condition = { kind: "metric", path: reportPath, key: "independent_candidates", operator: ">=", value: 2 };
if (mode === "prepare") {
  await mkdir(root); await mkdir(join(cwd, ".lin/experiments"), { recursive: true });
  await writeFile(join(cwd, ".lin/experiments/control.json"), '{"ready":false}');
  await writeFile(join(cwd, "README.md"), `本实验验证真实文献检索闭环，不执行命令，不写入或修改任何实验数据。\n唯一长期验收为 ${JSON.stringify(condition)}，只表示找到双源候选，不表示科学结论成立。\n先观察 .lin/experiments/control.json，ready=false 时 wait，observe_paths 包含 .lin/experiments/control.json。ready=true 后只建立一个 execute 候选，执行一次真实检索并发布组件。\n检索固定为 {action:"read_horizon",domain:"literature",query:${JSON.stringify(query)},path:${JSON.stringify(reportPath)}}，同一计划追加 update_component，patch={source:${JSON.stringify(reportPath)},metrics:[{label:"文献",key:"source_count"},{label:"双源候选",key:"independent_candidates"}],conclusion:{summary:"summary",details:"details"}}。\n不得用 write_file、patch_file、run_command 生成报告或替代检索，不扩大研究方向。无需人工补充验收条件；计划审批由验收程序核对上述操作后确认。\n反思必须依据结果 sources/pairs，选一组候选的两篇不同作品，简要对比摘要共同点、差异与局限，在 summary 中保留两篇原始 URL 的 Markdown 链接。作者不重合只证明筛选规则通过，独立数据或全文未核验必须说明。不得声称论文指标是本实验实测结果。\n`);
} else {
  await access(join(root, "task-id.txt"));
  await assert.rejects(access(join(root, "result.json")), { code: "ENOENT" });
}
const context = createTaskContextForDataDir(dataDir), memory = createMemoryContextForDataDir(dataDir).service;
let calls = 0;
const trace = (name: string, data: unknown = {}) => appendFileSync(join(root, "trace.jsonl"), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, mode, name, data }) + "\n");
const modelCalls: { phase: string; elapsedMs: number }[] = [];
const service = new ResearchService(context, memory, (cwd, model, resources) => {
  const reason = piReasoner(cwd, model, resources);
  return async (phase, input, signal) => {
    const started = performance.now(); calls++; trace("model.start", { phase });
    console.log(JSON.stringify({ phase, status: "real-model-request", call: calls }));
    const output = await reason(phase, input, signal);
    modelCalls.push({ phase, elapsedMs: performance.now() - started });
    trace("model.done", { phase, output }); return output;
  };
});
const feedback: unknown[] = [];
const unsubscribe = context.hub.subscribeGlobal((event) => {
  if (["tool_started", "tool_finished"].includes(event.type)) { feedback.push(event); trace(event.type, event.data); }
});
let task: TaskState | undefined;
async function until(predicate: () => boolean, label: string, approval = false) {
  const limit = Date.now() + 600000;
  while (!predicate()) {
    if (task!.autonomy!.phase === "FAILED" || (!approval && task!.autonomy!.phase === "PAUSED")) throw new Error(`${label}: ${task!.autonomy!.reason}`);
    if (Date.now() > limit) throw new Error(`${label} 超时`);
    await delay(100);
  }
  trace(label, { cycle: task!.autonomy!.cycle, calls });
  console.log(JSON.stringify({ status: label, cycle: task!.autonomy!.cycle, calls }));
}
async function quiet(label: string) {
  const before = { calls, seq: task!.lastEventSeq, job: task!.autonomy!.jobId };
  await delay(1500);
  assert.deepEqual({ calls, seq: task!.lastEventSeq, job: task!.autonomy!.jobId }, before, label);
  trace(label);
}
try {
  if (mode === "prepare") {
    task = await service.create(cwd, "检索并比较大豆荚果识别的两篇文献，验证双源候选并保留可追溯来源。按 README.md 执行本次完整验收。", undefined,
      { maxCycles: 10, decisionBudget: 3, permissions: { commands: [], writeRoots: [] } });
    await writeFile(join(root, "task-id.txt"), task.id);
    await until(() => task!.autonomy!.phase === "WAITING" && !task!.autonomy!.jobId && Boolean(task!.autonomy!.observation?.facts.some((f) => f.key === "file:.lin/experiments/control.json")), "等待控制文件 Hook");
    for (let i = 0; i < 16; i++) service.notify(task.id, [".lin/experiments/control.json"]);
    await quiet("相同事实不触发模型");
    await service.pause(task.id, "文献验收：暂停后重建服务");
    await writeFile(join(cwd, ".lin/experiments/control.json"), '{"ready":true}');
    assert.equal(service.notify(task.id, [".lin/experiments/control.json"]), false);
    await quiet("暂停后不检索");
  } else {
    task = context.store.get((await readFile(join(root, "task-id.txt"), "utf8")).trim())!;
    assert.equal(task.autonomy!.phase, "PAUSED");
    await service.recover(); await quiet("重建服务不自动继续");
    await service.resume(task.id);
    await until(() => Boolean(task!.autonomy!.approvalId), "等待查询授权", true);
    const plan = task.autonomy!.plan!;
    assert.equal(plan.steps.filter((s) => s.action === "read_horizon" && s.query === query && s.path === reportPath).length, 1);
    assert.ok(plan.steps.every((s) => s.action === "read_horizon" && s.domain === "literature" && s.query === query && s.path === reportPath || s.action === "update_component" && s.patch.source === reportPath));
    assert.deepEqual(plan.success_condition, condition);
    await assert.rejects(access(join(cwd, reportPath)), { code: "ENOENT" });
    const approval = task.autonomy!.approvalId!;
    assert.equal(await service.resolve(task.id, approval, true), true);
    await until(() => task!.autonomy!.phase === "COMPLETED", "检索、验收与反思完成");
    assert.equal(await service.resolve(task.id, approval, true), false);
    const report: LiteratureReport = JSON.parse(await readFile(join(cwd, reportPath), "utf8"));
    assert.ok(report.source_count >= 2 && report.pairs.length > 0);
    assert.ok(report.providers.some((p) => p.status === "ok"));
    const learning = task.autonomy!.learning!;
    const cited = report.sources.filter((source) => learning.summary.includes(source.url));
    assert.ok(cited.length >= 2, "真实模型反思必须引用至少两篇实际检索来源");
    assert.ok(report.pairs.some((pair) => pair.sources.every((id) => cited.some((s) => s.id === id))), "引用须对应一组作者不重合的不同作品候选");
    assert.ok(task.autonomy!.component!.state.metrics.some((m) => m.label === "文献" && m.value === report.source_count));
    assert.equal(task.autonomy!.component!.result!.evaluation!.passed, true);
    assert.equal(task.autonomy!.decision!.nodes.filter((n) => n.attempts > 0).length, 1);
    assert.equal(task.autonomy!.decision!.nodes.find((n) => n.attempts > 0)!.attempts, 1);
    const projection = await service.horizon(task.id).read("literature");
    assert.equal((projection.data as any).source_count, report.source_count);
    await quiet("完成后不重复执行");
    await writeFile(join(root, "result.json"), JSON.stringify({ status: "real-model-literature-loop-passed", model: task.model, taskId: task.id, report: reportPath,
      source_count: report.source_count, candidates: report.independent_candidates, providers: report.providers, summary: learning.summary, calls: modelCalls, feedback }, null, 2));
  }
  await writeFile(join(root, `${mode}-checkpoint.json`), JSON.stringify(task, null, 2));
  console.log(JSON.stringify({ status: `${mode}-passed`, root, calls }));
} catch (error) {
  if (task) await writeFile(join(root, `${mode}-failed-checkpoint.json`), JSON.stringify(task, null, 2));
  throw error;
} finally { unsubscribe(); await service.close(); }
