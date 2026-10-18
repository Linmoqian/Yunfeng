/* 固定公共学术索引适配器，限制地址、响应、重定向与等待时间。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { createHash } from "node:crypto";
export interface Source {
  id: string; title: string; url: string; doi?: string; authors: string[]; authorKeys: string[];
  authorsComplete: boolean; year?: string; excerpt: string; excerptTruncated: boolean; evidence: "abstract" | "metadata";
  origins: { provider: string; url: string; retrievedAt: string; sha256: string }[];
}
export type LiteratureFetch = typeof fetch;
const clean = (value: unknown, max: number) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&(?:lt|gt|amp|quot|apos);/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
export async function providerSearch(provider: "europepmc" | "crossref", query: string, signal: AbortSignal, request: LiteratureFetch): Promise<Source[]> {
  const url = new URL(provider === "europepmc" ? "https://www.ebi.ac.uk/europepmc/webservices/rest/search" : "https://api.crossref.org/works");
  const params = provider === "europepmc" ? { query, format: "json", resultType: "core", pageSize: "6" } : { "query.bibliographic": query, rows: "6" };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: "error", headers: { Accept: "application/json", "User-Agent": "Yunfeng-Research/0.1" } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`LITERATURE_HTTP_${response.status}`); }
  if (!response.body) throw new Error("LITERATURE_EMPTY_BODY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 512000) throw new Error("LITERATURE_RESPONSE_LIMIT");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const rows = provider === "europepmc" ? body.resultList?.result : body.message?.items;
  if (!Array.isArray(rows)) throw new Error("LITERATURE_INVALID_RESPONSE");
  const retrievedAt = new Date().toISOString();
  return rows.slice(0, 6).flatMap((row: any) => {
    const title = clean(provider === "europepmc" ? row.title : row.title?.[0], 240);
    const doi = clean(row.doi ?? row.DOI, 200).toLowerCase();
    const validDoi = /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : undefined;
    const source = clean(row.source, 15), recordId = clean(row.id, 60);
    if (!title || (!validDoi && (provider !== "europepmc" || !recordId || !/^[a-z\d_-]+$/i.test(source + recordId)))) return [];
    const authorRows = list(provider === "europepmc" ? row.authorList?.author : row.author);
    const authors = authorRows.slice(0, 32).map((a: any) => clean(a.fullName ?? [a.given, a.family].filter(Boolean).join(" "), 100)).filter(Boolean);
    const authorKeys = authorRows.slice(0, 32).map((a: any) => clean(a.lastName ?? a.family, 80).toLowerCase()).filter(Boolean);
    const abstract = clean(row.abstractText ?? row.abstract, 100000), excerpt = abstract.slice(0, 1000);
    const link = validDoi ? `https://doi.org/${encodeURI(validDoi).replace(/[?#]/g, encodeURIComponent)}` : `https://europepmc.org/article/${encodeURIComponent(source)}/${encodeURIComponent(recordId)}`;
    return [{ id: validDoi ? `doi:${validDoi}` : `${source}:${recordId}`, title, url: link, ...(validDoi ? { doi: validDoi } : {}), authors, authorKeys,
      authorsComplete: authorRows.length > 0 && authorRows.length <= 32 && authorKeys.length === authorRows.length,
      year: clean(row.pubYear ?? row.published?.["date-parts"]?.[0]?.[0], 10), excerpt, excerptTruncated: abstract.length > 1000, evidence: excerpt ? "abstract" as const : "metadata" as const,
      origins: [{ provider, url: url.href, retrievedAt, sha256: createHash("sha256").update(JSON.stringify(row)).digest("hex") }] }];
  });
}
