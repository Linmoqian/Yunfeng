/* 三轮对照共用的固定状态、数据和步骤；决策规则固定，不加载 Pi 或模型配置。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
export type Request = Record<string, any>;
export const at = "2026-10-18T00:00:00.000Z";
export const lanes = ["nodeDirect", "nodePipe", "rustPipe"] as const;
export type Lane = typeof lanes[number];
export async function prepareWorkflow(root: string) {
  await mkdir(join(root, ".lin/experiments"), { recursive: true });
  const task = { schemaVersion: 1, id: "workflow-task", sessionId: "workflow", cwd: root, title: "固定文件统计流程", source: "task", mode: "research", status: "waiting_input", phase: "unknown", currentAction: "", activeToolNames: [], pendingApprovalIds: [], createdAt: at, updatedAt: at, lastEventSeq: 0,
    autonomy: { schemaVersion: 1, goal: "固定文件统计流程", phase: "WAITING", cycle: 0, maxCycles: 20, reason: "等待事实", permissions: { commands: [], writeRoots: [] }, decision: { mission: { id: "mission", objective: "统计样本并比较筛选前后均值" }, horizon: [], budget: { limit: 10, spent: 0 }, reason: "规则回放", nodes: Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, parent: "mission", objective: `统计节点 ${i}`, kind: "execute", priority: .5, confidence: .9, cost: .1, expected_gain: .8, status: "pending", attempts: 0 })) } } };
  await writeFile(join(root, "task.json"), JSON.stringify(task));
  await writeFile(join(root, "control.json"), JSON.stringify({ ready: false, reviewApproved: false }));
  await writeFile(join(root, "samples.json"), JSON.stringify(Array.from({ length: 256 }, (_, i) => ({ id: i, value: i % 2 ? 4 : 0, keep: i % 2 === 1 }))));
}
type Step = { id: string; label: string; request?: Request; local?: (values: Map<string, any>) => any; restart?: boolean };
const read = (id: string, label: string, path: string): Step => ({ id, label, request: { op: "read", path } });
const checkpoint = (id: string, label: string, phase: string, cycle: number, nodeStatus = "pending"): Step => ({ id, label, request: { op: "checkpoint", reason: label, phase, cycle, nodeStatus } });
const event = (id: string, phase: string): Step => ({ id, label: `持久化 ${phase} 事件`, request: { op: "event", phase } });
const write = (id: string, label: string, path: string, content: unknown): Step => ({ id, label, request: { op: "write", path, content: JSON.stringify(content), condition: { kind: "file_exists", path } } });
const metric = (id: string, path: string, value: number): Step => ({ id, label: "回读真实指标并验收", request: { op: "evaluate", condition: { kind: "metric", path, key: "mean", operator: "==", value } } });
export const workflow: Step[] = [
  read("observe.wait", "观察等待条件", "control.json"),
  { id: "decide.wait", label: "规则决策：等待", local: (v) => ({ decision: JSON.parse(v.get("observe.wait")).ready ? "act" : "wait" }) },
  checkpoint("checkpoint.wait", "保存等待检查点", "WAITING", 0),
  write("trigger.ready", "写入外部就绪事实夹具", "control.json", { ready: true, reviewApproved: false }),
  read("hook.ready", "读取脚本注入的 Hook 事实", "control.json"),
  read("observe.samples", "观察真实样本文件", "samples.json"),
  { id: "decide.baseline", label: "规则决策：基线统计", local: (v) => ({ decision: JSON.parse(v.get("hook.ready")).ready ? "baseline" : "wait", sampleCount: JSON.parse(v.get("observe.samples")).length }) },
  checkpoint("checkpoint.baseline", "保存基线计划与节点状态", "EXECUTING", 1, "running"),
  write("execute.baseline.config", "execute 写基线配置", ".lin/experiments/config.json", { stage: "baseline" }),
  { id: "execute.baseline", label: "execute 统计样本、落盘并核验产物", request: { op: "experiment" } },
  event("event.baseline", "REFLECTING"),
  metric("evaluate.baseline", ".lin/experiments/baseline.json", 2),
  { id: "reflect.baseline", label: "规则反思：检查实际结果", local: (v) => ({ mean: v.get("execute.baseline").mean, next: "review", passed: v.get("evaluate.baseline").passed }) },
  write("memory.baseline", "记录基线反思候选", ".lin/experiments/memory.json", { baselineMean: 2, next: "review" }),
  checkpoint("checkpoint.pause", "保存暂停检查点", "PAUSED", 1, "succeeded"),
  event("event.pause", "PAUSED"),
  { id: "snapshot.pause", label: "读取暂停状态与关系树", request: { op: "snapshot" } },
  { id: "lifecycle.restart", label: "关闭并重建实例，从 SQLite 恢复", restart: true },
  { id: "snapshot.restore", label: "核对恢复后的暂停状态", request: { op: "snapshot" } },
  write("trigger.approval", "写入外部复核通过事实夹具", "control.json", { ready: true, reviewApproved: true }),
  read("hook.approval", "恢复后观察复核事实", "control.json"),
  read("observe.baseline", "回读基线指标", ".lin/experiments/baseline.json"),
  read("memory.read", "回读反思候选", ".lin/experiments/memory.json"),
  { id: "decide.optimize", label: "规则决策：选择固定筛选方案", local: (v) => ({ decision: JSON.parse(v.get("hook.approval")).reviewApproved ? "optimize" : "wait", baseline: JSON.parse(v.get("observe.baseline")).mean }) },
  checkpoint("checkpoint.resume", "保存恢复与优化计划", "EXECUTING", 2, "running"),
  write("execute.optimize.config", "execute 写筛选配置", ".lin/experiments/config.json", { stage: "optimize" }),
  { id: "execute.optimize", label: "execute 筛选统计、落盘并核验产物", request: { op: "experiment" } },
  event("event.optimize", "REFLECTING"),
  metric("evaluate.optimize", ".lin/experiments/optimize.json", 4),
  { id: "reflect.final", label: "规则反思：计算均值变化", local: (v) => ({ baseline: v.get("execute.baseline").mean, optimized: v.get("execute.optimize").mean, change: v.get("execute.optimize").mean / v.get("execute.baseline").mean - 1 }) },
  write("memory.final", "记录结论与指标", ".lin/experiments/conclusion.json", { baselineMean: 2, optimizedMean: 4, change: 1 }),
  checkpoint("checkpoint.completed", "保存完成状态", "COMPLETED", 2, "succeeded"),
  event("event.completed", "COMPLETED"),
  { id: "snapshot.final", label: "恢复最终检查点与关系树", request: { op: "snapshot" } },
];
