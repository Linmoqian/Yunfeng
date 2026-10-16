/* 科研组件适配器：复用组件调用契约，实测字段取自项目报告，保存到所属任务检查点。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { componentClient, type ComponentRequest, type ComponentSnapshot } from "../agent/component-client.js";
import { readProjectText } from "./project.js";
import { record, text } from "./values.js";
import type { Result } from "./types.js";

export interface ResearchPatch {
  source: string;
  progress?: { label: string; current: string; total?: string; unit?: string };
  metrics?: { label: string; key: string; unit?: string }[];
  conclusion?: { summary: string; details?: string };
}
export interface ResearchView {
  jobId: string; source: string; updatedAt: string;
  progress?: { label: string; current: number; total?: number; unit?: string };
  metrics: { label: string; value: number; unit?: string }[];
  conclusion?: { summary: string; details?: string };
}
export type ResearchSnapshot = ComponentSnapshot<"research", ResearchView> & { result?: Result };

/** 验收投影只接受所属作业结果；后续长期目标核验不覆盖实验自身的验收。 */
export function settleResearchComponent(snapshot: ResearchSnapshot | undefined, result: Result): void {
  if (snapshot?.state.jobId === result.job_id && !snapshot.result) { snapshot.result = result; snapshot.revision += 1; }
}

/** 包含旧检查点恢复路径，节点报告和当前报告均绑定同一个实测结果。 */
export function settleResearchReports(checkpoint: Pick<import("./types.js").ResearchCheckpoint, "component" | "decision">, result: Result): void {
  settleResearchComponent(checkpoint.component, result);
  for (const node of checkpoint.decision?.nodes ?? []) settleResearchComponent(node.report, result);
}

function fields(row: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(row).some((key) => !allowed.includes(key))) throw new Error("科研组件包含未知字段");
}
function selector(value: unknown): string {
  const key = text(value, 200);
  if (key.split(".").some((part) => !part || ["__proto__", "prototype", "constructor"].includes(part))) throw new Error("报告字段路径无效");
  return key;
}
function unit(row: Record<string, unknown>) { return row.unit === undefined ? {} : { unit: text(row.unit, 16) }; }

/** patch 声明 JSON 报告字段，不接受模型直接填写数值、验收状态或跨任务身份。 */
export function parseResearchPatch(value: unknown): ResearchPatch {
  const row = record(value);
  fields(row, ["source", "progress", "metrics", "conclusion"]);
  const patch: ResearchPatch = { source: text(row.source, 500) };
  if (row.progress !== undefined) {
    const p = record(row.progress); fields(p, ["label", "current", "total", "unit"]);
    patch.progress = { label: text(p.label, 40), current: selector(p.current), ...(p.total === undefined ? {} : { total: selector(p.total) }), ...unit(p) };
  }
  if (row.metrics !== undefined) {
    if (!Array.isArray(row.metrics) || !row.metrics.length || row.metrics.length > 6) throw new Error("关键指标需要 1 到 6 项");
    patch.metrics = row.metrics.map((value) => {
      const m = record(value); fields(m, ["label", "key", "unit"]);
      return { label: text(m.label, 40), key: selector(m.key), ...unit(m) };
    });
  }
  if (row.conclusion !== undefined) {
    const c = record(row.conclusion); fields(c, ["summary", "details"]);
    patch.conclusion = { summary: selector(c.summary), ...(c.details === undefined ? {} : { details: selector(c.details) }) };
  }
  if (!patch.progress && !patch.metrics && !patch.conclusion) throw new Error("科研组件缺少展示字段");
  return patch;
}

async function resolveView(cwd: string, jobId: string, patch: ResearchPatch): Promise<ResearchView> {
  const report: unknown = JSON.parse(await readProjectText(cwd, patch.source));
  const get = (key: string): unknown => key.split(".").reduce((value: unknown, part) => value && typeof value === "object" && Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined, report);
  const number = (key: string) => {
    const value = get(key);
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`报告字段 ${key} 需要有限数值`);
    return value;
  };
  const view: ResearchView = { jobId, source: patch.source, updatedAt: new Date().toISOString(), metrics: (patch.metrics ?? []).map((m) => ({ label: m.label, value: number(m.key), ...(m.unit ? { unit: m.unit } : {}) })) };
  if (patch.progress) {
    const p = patch.progress;
    const current = number(p.current), total = p.total === undefined ? undefined : number(p.total);
    if (current < 0 || (total !== undefined && (total <= 0 || current > total))) throw new Error("报告进度范围无效");
    view.progress = { label: p.label, current, ...(total === undefined ? {} : { total }), ...(p.unit ? { unit: p.unit } : {}) };
  }
  if (patch.conclusion) view.conclusion = { summary: text(get(patch.conclusion.summary), 500), ...(patch.conclusion.details ? { details: text(get(patch.conclusion.details), 8000) } : {}) };
  return view;
}

/** 当前 execute 作用域内的 read/patch；不提供独立窗口，也不访问其他任务。 */
export function researchComponents(cwd: string, jobId: string, read: () => ResearchSnapshot | undefined,
  publish: (view: ResearchView) => Promise<ResearchSnapshot>, signal: AbortSignal) {
  return componentClient<"research", ResearchPatch, ResearchView>(async <T>({ request }: { request: ComponentRequest<"research", ResearchPatch> }) => {
    signal.throwIfAborted();
    if (request.component !== "research") throw new Error("科研组件不属于当前任务");
    if (request.action === "read") {
      const snapshot = read();
      if (!snapshot) throw new Error("科研组件尚未发布报告");
      return snapshot as T;
    }
    if (request.action !== "patch") throw new Error("科研组件仅支持 read/patch");
    const view = await resolveView(cwd, jobId, parseResearchPatch(request.patch));
    signal.throwIfAborted();
    return await publish(view) as T;
  });
}
