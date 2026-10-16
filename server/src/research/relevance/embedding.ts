/* 显式配置的 Embedding 兼容接口；限制响应与维度，不回显上游正文或凭据。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { createHash } from "node:crypto";
import type { Embedder } from "./types.js";

export function vectors(value: unknown, count: number): number[][] {
  if (!Array.isArray(value) || value.length !== count) throw new Error("词向量数量无效");
  let dimension = 0;
  return Array.from(value).map((row) => {
    if (!Array.isArray(row) || row.length < 1 || row.length > 8192 || Array.from(row).some((n) => typeof n !== "number" || !Number.isFinite(n))
      || !row.some((n) => n !== 0) || (dimension && dimension !== row.length)) throw new Error("词向量维度或数值无效");
    dimension = row.length;
    const norm = Math.hypot(...row);
    if (!Number.isFinite(norm)) throw new Error("词向量范数无效");
    return row.map((n) => n / norm);
  });
}
/** 仅从宿主环境读取独立的 Embedding 配置；不探测聊天模型或其他服务。 */
export function configuredEmbedder(env = process.env, request = fetch): Embedder | undefined {
  const endpoint = env.YUNFENG_EMBEDDING_URL, model = env.YUNFENG_EMBEDDING_MODEL;
  if (!endpoint && !model) return undefined;
  if (!endpoint || !model || model.length > 200) throw new Error("请配置 Embedding 地址与模型");
  const url = new URL(endpoint);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new Error("Embedding 地址无效");
  const key = env.YUNFENG_EMBEDDING_API_KEY;
  const identity = createHash("sha256").update(`${url.href}\n${model}`).digest("hex");
  return { model, identity, async embed(input, signal) {
    if (!input.length || input.length > 101 || input.some((s) => !s || s.length > 4000)) throw new Error("词向量输入超出范围");
    const response = await request(url, { method: "POST", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, input, encoding_format: "float" }) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Embedding 请求失败（HTTP ${response.status}）`); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Embedding 返回为空");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 8 * 1024 * 1024) throw new Error("Embedding 响应过长"); chunks.push(value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(body.data) || body.data.length !== input.length || (body.model !== undefined && body.model !== model)) throw new Error("Embedding 响应模型或数量无效");
    const ordered: unknown[] = Array(input.length);
    for (const item of body.data) {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= input.length || ordered[item.index] !== undefined) throw new Error("Embedding 索引无效");
      ordered[item.index] = item.embedding;
    }
    return vectors(ordered, input.length);
  } };
}
