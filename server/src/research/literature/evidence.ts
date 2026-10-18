/* 为反思保留有界摘要证据，核对真实引用；格式校验不替代语义与独立性核验。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import type { Learning, Result } from "../types.js";
import type { LiteratureReport } from "./report.js";
export function literatureEvidence(...results: (Result | undefined)[]) {
  for (const result of results) for (const line of (result?.output ?? "").split("\n").reverse()) {
    try {
      const row = JSON.parse(line), report = row.data as LiteratureReport;
      if (row.domain !== "literature" || report?.schemaVersion !== 1 || !Array.isArray(report.sources) || !Array.isArray(report.pairs)) continue;
      return { query: report.query, source_count: report.source_count, candidate_sources: report.independent_candidates,
        retained_candidate_pairs: report.pairs.length, pairs: report.pairs.slice(0, 10), limitations: report.limitations,
        sources: report.sources.slice(0, 6).map((s) => ({ id: s.id, title: s.title, url: s.url, excerpt: s.excerpt, evidence: s.evidence, excerptTruncated: s.excerptTruncated })) };
    } catch { /* 其他工具的文本输出不是文献证据。 */ }
  }
  return undefined;
}
/** 验证输出引用来自实际候选，不能用命中数量代替两源比较。 */
export function validateLiteratureLearning(context: unknown, learning: Learning): Learning {
  const evidence = (context as { literature?: ReturnType<typeof literatureEvidence> })?.literature;
  if (!evidence?.pairs.length) return learning;
  const cited = evidence.sources.filter((source) => learning.summary.includes(`](${source.url})`));
  if (!evidence.pairs.some((pair) => pair.sources.every((id) => cited.some((s) => s.id === id)))) {
    throw new Error("文献反思 summary 须用 Markdown 链接引用同一候选组的两篇真实来源，并简述摘要共同点、差异和未验证局限；不能只复述文献数量。原 URL 位于 context.literature.sources。");
  }
  return learning;
}
