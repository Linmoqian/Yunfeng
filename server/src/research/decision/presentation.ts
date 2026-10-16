/* Agent 生成的节点展示摘要；只修改标题与描述，不改变执行目标和验收事实。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import type { DecisionState } from "./types.js";
import type { Reasoner } from "../reasoner.js";
import { record, text } from "../values.js";
export interface NodePresentation { title: string; summary: string }
export function parsePresentation(value: unknown): NodePresentation {
  const row = record(value);
  if (Object.keys(row).some((key) => !["title", "summary"].includes(key))) throw new Error("节点摘要仅接受 title 和 summary");
  const title = text(row.title, 32).trim(), summary = text(row.summary, 100).trim();
  if (/[\r\n]/.test(title + summary)) throw new Error("节点标题与描述须为单行文本");
  return { title, summary };
}
export function parseSummaries(value: unknown) {
  const items = record(value).presentations;
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error("每批节点摘要须为1到20项");
  const rows = items.map((value) => {
    const row = record(value);
    if (Object.keys(row).some((key) => !["node", "title", "summary"].includes(key))) throw new Error("节点摘要字段无效");
    return { node: text(row.node, 100), ...parsePresentation({ title: row.title, summary: row.summary }) };
  });
  if (new Set(rows.map((row) => row.node)).size !== rows.length) throw new Error("节点摘要不能重复");
  return rows;
}
/** 为旧记录补齐一批缺失摘要；调用方须在保存前核对任务版本。 */
export async function summarizeMissing(tree: DecisionState, reason: Reasoner, signal: AbortSignal): Promise<DecisionState> {
  const next = structuredClone(tree);
  const missing = [next.mission, ...next.nodes].filter((node) => !node.presentation).slice(0, 20);
  if (!missing.length) return next;
  const rows = parseSummaries(await reason("summarize", { nodes: missing.map((node) => ({ id: node.id, objective: node.objective, kind: "kind" in node ? node.kind : "mission" })) }, signal));
  signal.throwIfAborted();
  if (rows.length !== missing.length || rows.some((row) => !missing.some((node) => node.id === row.node))) throw new Error("节点摘要必须准确对应本批节点");
  for (const row of rows) missing.find((node) => node.id === row.node)!.presentation = { title: row.title, summary: row.summary };
  return next;
}
