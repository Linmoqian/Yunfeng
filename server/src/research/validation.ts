/* 校验模型提交的计划和反思，未知形状不会进入执行器。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import type { Condition, Learning, Plan, Step } from "./types.js";
import { parseResearchPatch } from "./components.js";
import { record, text } from "./values.js";
export { record, text } from "./values.js";
export function step(value: unknown): Step {
  const item = record(value);
  if (item.action === "focus_component") {
    if (item.component !== "research-graph" || Object.keys(item).some((key) => !["action", "component", "target"].includes(key))) throw new Error("仅允许聚焦当前科研关系图");
    return { action: "focus_component", component: "research-graph", target: text(item.target ?? "current", 100) };
  }
  if (item.action === "update_component") {
    if (item.component !== "research" || Object.keys(item).some((key) => !["action", "component", "patch"].includes(key))) throw new Error("仅允许更新当前科研组件");
    return { action: "update_component", component: "research", patch: parseResearchPatch(item.patch) };
  }
  if (item.action === "write_file") {
    if (typeof item.content !== "string") throw new Error("write_file.content 必须是文本字符串，JSON 对象须先序列化");
    if (Buffer.byteLength(item.content, "utf8") > 65536) throw new Error("文件内容超过 64 KiB 限制");
    return { action: "write_file", path: text(item.path, 500), content: item.content };
  }
  if (item.action === "run_command" && Array.isArray(item.args) && item.args.length <= 32 && item.args.every((arg) => typeof arg === "string" && arg.length <= 2000 && !arg.includes("\0"))) {
    return { action: "run_command", program: text(item.program, 500), args: item.args as string[] };
  }
  throw new Error("计划只支持受控文件写入、无 shell 命令和科研组件更新");
}
export function condition(value: unknown): Condition {
  const item = record(value);
  const path = text(item.path, 500);
  if (item.kind === "file_exists") return { kind: "file_exists", path };
  if (item.kind === "metric" && [">", ">=", "<", "<=", "=="].includes(String(item.operator)) && typeof item.value === "number" && Number.isFinite(item.value)) {
    return { kind: "metric", path, key: text(item.key, 200), operator: item.operator as ">" | ">=" | "<" | "<=" | "==", value: item.value };
  }
  throw new Error("验收条件必须引用真实文件或 JSON 数值指标");
}
export function parsePlan(value: unknown): Plan {
  const item = record(value);
  if (!["act", "wait", "complete"].includes(String(item.decision)) || !Array.isArray(item.steps) || item.steps.length > 8) throw new Error("计划结构无效");
  const steps = item.steps.map(step);
  if (item.decision === "act" && !steps.length) throw new Error("执行计划必须包含步骤");
  if (item.decision !== "act" && steps.length) throw new Error("等待或完成决定不能包含副作用步骤");
  const success = item.success_condition === undefined ? undefined : condition(item.success_condition);
  if (item.decision !== "wait" && !success) throw new Error("计划缺少可核验的验收条件");
  const paths = item.observe_paths;
  if (paths !== undefined && (!Array.isArray(paths) || paths.length > 8)) throw new Error("观察路径无效");
  return { decision: item.decision as Plan["decision"], reason: text(item.reason), steps, ...(success ? { success_condition: success } : {}), ...(paths ? { observe_paths: (paths as unknown[]).map((p) => text(p, 500)) } : {}) };
}
export function parseLearning(value: unknown): Learning {
  const item = record(value);
  if (!Array.isArray(item.knowledge_update) || item.knowledge_update.length > 8) throw new Error("知识更新无效");
  return { summary: text(item.summary), next_question: typeof item.next_question === "string" ? item.next_question.slice(0, 2000) : "", knowledge_update: item.knowledge_update.map((entry) => {
    const row = record(entry); return { key: text(row.key, 200), value: text(row.value, 2000) };
  }) };
}
