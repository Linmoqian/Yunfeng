/* 节点周围的凝练事实：只绑定当前作业，指标和结论保留原始来源。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { TaskState } from "../../services/taskService";
import { researchNodeStatus } from "./researchGraph";
export interface NodeInfo {
  status: string; passed?: boolean;
  progress?: string;
  metrics: string[];
  conclusion?: string;
}
const number = (value: number) => value.toLocaleString("zh-CN", { maximumSignificantDigits: 5 });
export function researchNodeInfo(task: TaskState, id: string): NodeInfo {
  const nodes = task.autonomy?.decision?.nodes ?? [];
  const node = nodes.find((item) => item.id === id);
  if (!node || node.kind === "group") {
    const children = (id === "mission" ? nodes : nodes.filter((item) => item.parent === id)).filter((item) => item.kind !== "group");
    return { status: id === "mission" && task.autonomy?.phase === "COMPLETED" ? "已完成" : id === "mission" ? "研究目标" : "目标分组", metrics: [],
      ...(children.length ? { progress: `完成 ${children.filter((item) => item.status === "succeeded").length}/${children.length}` } : {}) };
  }
  const current = task.autonomy?.component;
  const report = node.report && node.report.state.jobId === node.jobId ? node.report
    : current && current.state.jobId === node.jobId ? current : undefined;
  const view = report?.state;
  const progress = view?.progress;
  return { status: researchNodeStatus[node.status], passed: node.status === "succeeded" ? true : ["failed", "blocked"].includes(node.status) ? false : undefined,
    ...(progress ? { progress: `${progress.label} ${number(progress.current)}${progress.total === undefined ? "" : `/${number(progress.total)}`}${progress.unit ?? ""}` } : {}),
    metrics: (view?.metrics ?? []).slice(0, 2).map((item) => `${item.label} ${number(item.value)}${item.unit ? ` ${item.unit}` : ""}`),
    conclusion: view?.conclusion?.summary ?? node.reflection };
}
