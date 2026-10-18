/* 从持久化证据独立复核事件、请求、作业和候选记忆，不调用模型。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskEvent, TaskState } from "../../src/task/types.js";
import type { Memory } from "../../src/plugins/memory/types.js";

interface Trace {
  name: string; pid: number; mode: string; phase?: string; model?: string;
  status?: number; selected?: boolean; scientificSkill?: boolean; hidden?: boolean;
  tools?: number; duration?: number; label?: string;
}
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const jsonl = <T>(path: string): T[] => readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));

/** 全部断言通过才生成审计摘要；不读取凭据、请求头或原始模型请求。 */
export function audit(root: string) {
  const trace = jsonl<Trace>(join(root, "trace.jsonl"));
  const first = json<TaskState>(join(root, "baseline-checkpoint.json"));
  const last = json<TaskState>(join(root, "optimize-checkpoint.json"));
  assert.equal(first.id, last.id);
  assert.equal(first.autonomy!.phase, "PAUSED");
  assert.equal(last.autonomy!.phase, "COMPLETED");
  const requests = trace.filter((e) => e.name === "provider.request");
  const responses = trace.filter((e) => e.name === "provider.response");
  assert.ok(requests.length > 0);
  assert.equal(requests.length, responses.length);
  assert.ok(responses.every((e) => e.status === 200));
  assert.ok(requests.every((e) => e.selected && e.scientificSkill && !e.hidden && e.tools === 0));
  const starts = trace.filter((e) => e.name === "sdk.agent_start");
  const settled = trace.filter((e) => e.name === "sdk.agent_settled");
  assert.equal(starts.length, settled.length);
  const calls = trace.filter((e) => e.name === "reason.start").length;
  assert.ok(starts.length >= calls && starts.length <= 2 * calls, "阶段最多一次结构纠正，不能自唤醒");
  assert.notEqual(starts.find((e) => e.mode === "baseline")!.pid, starts.find((e) => e.mode === "optimize")!.pid);
  const quiet = trace.filter((e) => e.name === "quiet.passed");
  assert.equal(quiet.length, 6);
  assert.ok(quiet.every((e) => (e.duration ?? 0) >= 3000));
  const events = jsonl<TaskEvent>(join(root, "data/tasks", first.id, "events.jsonl"));
  const snapshots = events.filter((e) => e.type === "task_updated").map((e) => e.data as TaskState);
  const signals = snapshots.flatMap((s) => s.autonomy?.trigger?.signals ?? []);
  assert.ok(signals.some((s) => s.event.kind === "pi_extension" && s.event.action === "facts_changed"));
  assert.ok(signals.some((s) => s.event.kind === "lifecycle" && s.event.action === "resumed"));
  assert.ok(!signals.some((s) => s.event.kind === "pi_extension" && ["agent_start", "agent_settled"].includes(s.event.action)));
  const phases = [...new Set(snapshots.map((s) => s.autonomy?.phase))];
  for (const phase of ["OBSERVING", "PLANNING", "EXECUTING", "WAITING", "REFLECTING", "COMPLETED"] as const) assert.ok(phases.includes(phase));
  const executions = snapshots.filter((s) => s.autonomy?.phase === "EXECUTING");
  const jobs = [...new Set(executions.map((s) => s.autonomy!.jobId))];
  // 两个实验作业加一个无副作用的长期目标验收作业。
  assert.equal(jobs.length, 3);
  for (const state of executions) for (const step of state.autonomy!.plan!.steps) {
    if (step.action === "write_file") assert.equal(step.path, ".lin/experiments/config/config.json");
    else if (step.action === "run_command") { assert.equal(step.program, process.execPath); assert.deepEqual(step.args, ["benchmark.mjs"]); }
    else assert.equal(step.action, "update_component");
  }
  const memories = jsonl<Memory>(join(root, "data/memory/memories.jsonl"));
  assert.equal(memories.length, 3);
  assert.equal(new Set(memories.map((m) => m.refId)).size, 3);
  assert.deepEqual(memories.map((m) => m.refId).sort(), jobs.sort());
  assert.ok(memories.every((m) => m.kind === "episode" && m.source === "agent_inferred" && m.confidence === "candidate"));
  const result = json<{ report: { bytes: number; improvement: number; roundtrip: boolean } }>(join(root, "result.json"));
  const summary = { status: "passed", taskId: first.id, models: [...new Set(requests.map((e) => e.model))],
    requests: requests.length, sdkLifecyclePairs: starts.length, phases,
    reasonCalls: Object.fromEntries(["decide", "plan", "reflect"].map((phase) => [phase, trace.filter((e) => e.name === "reason.done" && e.phase === phase).length])),
    cycles: last.autonomy!.cycle, experimentExecutions: 2, jobs: jobs.length, candidateMemories: memories.length,
    independentProcesses: 2, quietWindows: quiet.map((e) => ({ label: e.label, duration: e.duration })),
    skills: last.autonomy!.skills, bytes: result.report.bytes, improvement: result.report.improvement, roundtrip: result.report.roundtrip };
  writeFileSync(join(root, "audit.json"), JSON.stringify(summary, null, 2));
  return summary;
}
