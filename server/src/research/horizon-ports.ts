/* 从任务、文稿和资源模块构建视界投影，详情沿用现有组件与数据库。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { applicationComponents } from "../agent/component-client.js";
import type { TaskState } from "../task/types.js";
import { createHorizon, type HorizonPorts } from "./horizon.js";
export function taskHorizon(task: () => TaskState) {
  const ports: HorizonPorts = {
    literature: async () => {
      const state = task().autonomy!;
      // 最终验收会替换 lastResult；来源继续从已持久化的组件和节点报告恢复。
      const results = [state.result, state.lastResult, state.component?.result, ...[...(state.decision?.nodes ?? [])].reverse().map((n) => n.report?.result)];
      for (const result of results) {
        for (const line of (result?.output ?? "").split("\n").reverse()) {
          try {
            const item = JSON.parse(line);
            if (item.domain === "literature" && item.data?.schemaVersion === 1 && Array.isArray(item.data.sources)) {
              return { summary: String(item.data.summary).slice(0, 500), revision: task().lastEventSeq,
                data: { path: item.path, query: item.data.query, retrievedAt: item.data.retrievedAt, source_count: item.data.source_count, independent_candidates: item.data.independent_candidates,
                  sources: item.data.sources.slice(0, 6).map((s: Record<string, unknown>) => ({ id: s.id, title: s.title, url: s.url, evidence: s.evidence })), limitations: item.data.limitations } };
            }
          } catch { /* 命令输出和普通文件回执不属于文献结果。 */ }
        }
      }
      return { summary: "尚未检索文献，可通过 execute 提交公开查询并保存来源", data: { source_count: 0, independent_candidates: 0 } };
    },
    training: async () => {
      const state = task().autonomy!;
      return { summary: state.reason.slice(0, 500), revision: task().lastEventSeq,
        data: { phase: state.phase, jobId: state.jobId, report: state.component ? { revision: state.component.revision, progress: state.component.state.progress, metrics: state.component.state.metrics, conclusion: state.component.state.conclusion, evaluation: state.component.result?.evaluation } : undefined } };
    },
    ideas: async () => {
      const state = task().autonomy!.decision;
      return { summary: state?.mission.objective.slice(0, 500) ?? "尚未建立研究目标", revision: task().lastEventSeq,
        data: { selectedId: state?.selectedId, total: state?.nodes.length ?? 0, nodes: state?.nodes.slice(0, 8).map((n) => ({ id: n.id, parent: n.parent, objective: n.objective.slice(0, 500), status: n.status })) } };
    },
  };
  const components = applicationComponents();
  if (components) {
    const literature = ports.literature!;
    ports.literature = async () => {
      const view = await literature();
      try {
        const snapshot = await components.read("resources");
        const files = Array.isArray(snapshot.state.files) ? snapshot.state.files : [];
        return { ...view, data: { ...view.data as object, files: files.slice(0, 20), total: files.length, truncated: files.length > 20 } };
      } catch { return { ...view, data: { ...view.data as object, resourcesUnavailable: true } }; }
    };
    ports.writing = async () => {
      const snapshot = await components.read("writing");
      const body = String(snapshot.state.body ?? "");
      return { summary: String(snapshot.state.name ?? "文稿").slice(0, 100), revision: snapshot.revision,
        data: { excerpt: body.slice(0, 2000), truncated: body.length > 2000 } };
    };
  }
  return createHorizon(task().id, ports);
}
