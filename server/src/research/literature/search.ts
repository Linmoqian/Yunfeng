/* execute 内的真实检索与来源落盘；复用文件权限、仲裁、取消和报告渲染。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { toolArbiter } from "../tool-arbiter.js";
import { projectPath, readProjectText } from "../project.js";
import { writeExecutionFile } from "../execution-files.js";
import { providerSearch, type LiteratureFetch } from "./providers.js";
import { digest, literatureReport, type LiteratureReport } from "./report.js";
export interface LiteratureQuery { query: string; path: string }
/** 公共索引仅接收已确认查询，不发送项目文件；同查询同报告复用已有检索回执。 */
export async function searchLiterature(cwd: string, input: LiteratureQuery, signal: AbortSignal, request: LiteratureFetch = fetch) {
  if (!input.query.trim() || input.query.length > 300 || /[\x00-\x1f]/.test(input.query) || !/^\.lin\/experiments\/[\w/-]+\.json$/.test(input.path)) throw new Error("LITERATURE_INPUT：需要公开查询与实验目录内 JSON 报告路径");
  const target = await projectPath(cwd, input.path);
  return toolArbiter.run({ tool: "horizon", resources: [{ key: `literature:${target}`, write: true }], signal }, async () => {
    let cached: LiteratureReport | undefined;
    try {
      const stored = JSON.parse(await readProjectText(cwd, input.path));
      const { digest: checksum, ...content } = stored;
      if (stored.schemaVersion !== 1 || stored.query !== input.query || checksum !== digest(content) || !Array.isArray(stored.sources) || !Array.isArray(stored.pairs)) throw new Error("LITERATURE_CONFLICT：报告已存在，请保留原来源并换用新路径");
      cached = stored;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    signal.throwIfAborted();
    if (cached) return { domain: "literature" as const, available: true, cached: true, path: input.path, data: cached };
    const providers = ["europepmc", "crossref"] as const;
    const results = await Promise.allSettled(providers.map((provider) => providerSearch(provider, input.query, signal, request)));
    signal.throwIfAborted();
    const status = results.map((result, i) => ({ provider: providers[i]!, status: result.status === "fulfilled" ? "ok" : /LITERATURE_(?:HTTP_\d{3}|RESPONSE_LIMIT|INVALID_RESPONSE|EMPTY_BODY)/.exec(String(result.reason))?.[0] ?? "LITERATURE_UNAVAILABLE" }));
    if (results.every((r) => r.status === "rejected")) throw new Error("LITERATURE_UNAVAILABLE：学术检索暂不可用，未保存成功报告");
    const report = literatureReport(input.query, results.flatMap((r) => r.status === "fulfilled" ? r.value : []), status);
    await writeExecutionFile(cwd, input.path, JSON.stringify(report), signal);
    return { domain: "literature" as const, available: true, cached: false, path: input.path, data: report };
  });
}
