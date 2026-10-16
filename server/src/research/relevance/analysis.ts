/* 词向量召回后交给决策模型辨别方向；有界缓存和失败降级不阻塞科研执行。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { relevanceSource } from "./source.js";
import type { DecisionState } from "../decision/types.js";
import type { Reasoner } from "../reasoner.js";
import { record, text } from "../values.js";
import { configuredEmbedder, vectors } from "./embedding.js";
import type { Embedder, NodeRelevance } from "./types.js";

/** 分类只能引用服务器召回的节点；方向按当前节点指向 target 定义。 */
export function parseClassification(value: unknown) {
  const rows = record(value).matches;
  if (!Array.isArray(rows) || rows.length > 3) throw new Error("关系建议最多三项");
  const seen = new Set<string>();
  return rows.map((value) => {
    const row = record(value), target = text(row.target, 100);
    if (seen.has(target) || !["progression", "dependency", "abstraction", "related"].includes(String(row.relation))
      || !["outgoing", "incoming", "undirected"].includes(String(row.direction)) || typeof row.confidence !== "number"
      || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1
      || (row.relation === "related" ? row.direction !== "undirected" : row.direction === "undirected")) throw new Error("关系建议类型或方向无效");
    seen.add(target);
    return { target, relation: row.relation, direction: row.direction, confidence: row.confidence, reason: text(row.reason, 160) } as Omit<NodeRelevance["matches"][number], "similarity">;
  });
}

export class RelevanceAnalyzer {
  private readonly failedAt = new Map<string, number>();
  private readonly cache = new Map<string, number[]>();
  constructor(private readonly provider: () => Embedder | undefined = configuredEmbedder) {}
  async analyze(tree: DecisionState, node: string, reason: Reasoner, signal: AbortSignal): Promise<DecisionState> {
    signal.throwIfAborted();
    const next = structuredClone(tree), owner = node === "mission" ? next.mission : next.nodes.find((n) => n.id === node);
    if (!owner) throw new Error("相关性节点不存在");
    const source = relevanceSource(tree);
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(35_000)]);
    const failureKey = `${node}:${source}`;
    if (Date.now() - (this.failedAt.get(failureKey) ?? 0) < 60_000 && owner.relevance?.status === "unavailable") return next;
    try {
      const provider = this.provider();
      if (!provider) { owner.relevance = { status: "unconfigured", source, matches: [] }; return next; }
      const previous = owner.relevance;
      if (previous?.status === "ready" && previous.source === source && previous.space === provider.identity) return next;
      const items = [next.mission, ...next.nodes];
      const inputs = items.map((n) => n.objective.slice(0, 4000));
      const keys = inputs.map((s) => `${provider.identity}:${s}`);
      const missing = [...new Set(keys.filter((key) => !this.cache.has(key)))];
      if (missing.length) {
        const values = vectors(await provider.embed(missing.map((key) => inputs[keys.indexOf(key)]), requestSignal), missing.length);
        missing.forEach((key, i) => this.cache.set(key, values[i]));
      }
      const embeddings = keys.map((key) => this.cache.get(key)!);
      const dimension = embeddings[0].length;
      if (embeddings.some((v) => v.length !== dimension)) { this.cache.clear(); throw new Error("词向量空间维度发生变化"); }
      const current = embeddings[items.findIndex((n) => n.id === node)];
      const ranked = items.map((item, i) => ({ target: item.id, objective: inputs[i], similarity: Math.max(-1, Math.min(1, current.reduce((sum, n, j) => sum + n * embeddings[i][j], 0))) }))
        .filter((item) => item.target !== node && item.similarity >= 0.35).sort((a, b) => b.similarity - a.similarity).slice(0, 3);
      const classified = ranked.length ? parseClassification(await reason("relate", { node: { id: node, objective: owner.objective.slice(0, 4000) }, candidates: ranked }, requestSignal)) : [];
      const matches = classified.map((item) => {
        const candidate = ranked.find((n) => n.target === item.target);
        if (!candidate) throw new Error("关系建议引用未召回节点");
        return { ...item, similarity: candidate.similarity };
      });
      requestSignal.throwIfAborted();
      this.failedAt.delete(failureKey);
      owner.relevance = { status: "ready", source, space: provider.identity, model: provider.model, matches };
    } catch {
      signal.throwIfAborted();
      this.failedAt.set(failureKey, Date.now());
      owner.relevance = { status: "unavailable", source, matches: [] };
    } finally {
      while (this.failedAt.size > 64) this.failedAt.delete(this.failedAt.keys().next().value!);
      while (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
    }
    return next;
  }
}
