/* 节点相关性契约：余弦值与模型推断分别记录，不代表实测因果。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
export interface NodeRelevance {
  status: "ready" | "unconfigured" | "unavailable";
  source: string;
  model?: string;
  space?: string;
  matches: {
    target: string;
    similarity: number;
    relation: "progression" | "dependency" | "abstraction" | "related";
    direction: "outgoing" | "incoming" | "undirected";
    confidence: number;
    reason: string;
  }[];
}
export interface Embedder {
  model: string;
  identity: string;
  embed(input: string[], signal: AbortSignal): Promise<number[][]>;
}
