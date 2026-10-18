/* 从任务、文稿和资源模块构建视界投影，详情沿用现有组件与数据库。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { applicationComponents } from "../agent/component-client.js";
import type { TaskState } from "../task/types.js";
import { createHorizon, type HorizonPorts } from "./horizon.js";
export function taskHorizon(task: () => TaskState) {
  const ports: HorizonPorts = {
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
    ports.writing = async () => {
      const snapshot = await components.read("writing");
      const body = String(snapshot.state.body ?? "");
      return { summary: String(snapshot.state.name ?? "文稿").slice(0, 100), revision: snapshot.revision,
        data: { excerpt: body.slice(0, 2000), truncated: body.length > 2000 } };
    };
    ports.literature = async () => {
      const snapshot = await components.read("resources");
      const files = Array.isArray(snapshot.state.files) ? snapshot.state.files : [];
      return { summary: "资源模块中的材料元数据，文献内容与来源尚需核验", revision: snapshot.revision,
        data: { files: files.slice(0, 20), total: files.length, truncated: files.length > 20 } };
    };
  }
  return createHorizon(task().id, ports);
}
