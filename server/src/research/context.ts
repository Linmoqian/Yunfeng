/* 将 Hook 通知与最新项目事实组成决策上下文，通知本身不充当实验指标。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import type { TaskState } from "../task/types.js";
import { observeProject, readProjectText } from "./project.js";
import type { State } from "./types.js";
import type { HookSignal } from "./hooks/types.js";
const fileValue = (value: unknown) => typeof value === "string" ? value : "unreadable";

/** 同事实通知只回读所指文件；无需扫描 Git、写检查点或触发 UI 阶段切换。 */
export async function notifiedFilesChanged(task: TaskState, signals: HookSignal[]): Promise<boolean> {
  const previous = task.autonomy?.observation;
  if (!previous || signals.some((s) => s.event.kind !== "files_changed" && s.event.kind !== "pi_extension")) return true;
  const paths = [...new Set(signals.flatMap(({ event }) => event.kind === "files_changed" || event.kind === "pi_extension" ? event.paths : []))];
  for (const path of paths) {
    let value: unknown;
    try { value = await readProjectText(task.cwd, path); } catch { value = undefined; }
    if (fileValue(previous.facts.find((f) => f.key === `file:${path}`)?.value) !== fileValue(value)) return true;
  }
  return false;
}
export function observedPaths(task: TaskState): string[] {
  const state = task.autonomy!;
  return [...new Set([
    ...(state.decision?.mission.condition ? [state.decision.mission.condition.path] : []),
    ...(state.plan?.success_condition ? [state.plan.success_condition.path] : []),
    ...(state.plan?.observe_paths ?? []),
    ...(state.observation?.facts.filter((f) => f.key.startsWith("file:")).map((f) => f.key.slice(5)) ?? []),
    "README.md", "package.json",
  ])].slice(0, 8);
}
export async function buildContext(task: TaskState, memory: unknown[]): Promise<State> {
  const checkpoint = task.autonomy!;
  const triggers = checkpoint.trigger?.signals ?? [];
  const result = checkpoint.result ?? checkpoint.lastResult;
  const state = await observeProject(task.cwd, observedPaths(task), memory, [...triggers, ...(result ? [result] : [])]);
  state.facts.push({ key: "task.status", value: task.status, timestamp: new Date().toISOString(), source: "TaskStore" });
  state.constraints.push("Hook 是变更通知；动作价值由 Decision Layer 判断，未知状态须重新观察");
  return state;
}
/** 通知去重之后再次核对事实，事件排队期间已观察过的内容不触发模型。 */
export function contextChanged(previous: State | undefined, current: State, signals: HookSignal[]): boolean {
  if (!previous || signals.some((s) => s.event.kind !== "files_changed" && s.event.kind !== "pi_extension")) return true;
  return signals.some(({ event }) => (event.kind === "files_changed" || event.kind === "pi_extension") && event.paths.some((path) => {
    const key = `file:${path}`;
    return fileValue(previous.facts.find((f) => f.key === key)?.value) !== fileValue(current.facts.find((f) => f.key === key)?.value);
  }));
}
