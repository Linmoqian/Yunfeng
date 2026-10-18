/* 复用桌面私有通道执行有界文件操作；无后台进程、无自动重试和故障回退。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { desktopConnection, type DesktopCall } from "../agent/desktop-client.js";
import type { Condition, Result } from "./types.js";
export type FileRead = { content: string; error?: never } | { error: string; content?: never };
export type FileWrite = { path: string; content: string };
type Evaluation = NonNullable<Result["evaluation"]>;
type Request = { action: "read"; cwd: string; path: string }
  | { action: "write"; cwd: string; path: string; content: string }
  | { action: "evaluate"; cwd: string; condition: Condition }
  | { action: "read_many"; cwd: string; paths: readonly string[] }
  | { action: "write_many"; cwd: string; files: readonly FileWrite[]; condition?: Condition };
export type ResearchEnvelope = { action: "research"; request: Request };
/** v1 宿主逐项调用；v2 仅合并调用方明确交付的相邻操作，不跨异步边界攒批。 */
export function researchFileClient(call: DesktopCall<ResearchEnvelope>, batch = true) {
  let active = 0, submittedRequests = 0;
  async function send<T>(request: Request): Promise<T> {
    if (active >= 8) throw new Error("科研文件请求容量已满");
    active++;
    submittedRequests++;
    try { return await call<T>({ action: "research", request }); }
    finally { active--; }
  }
  const read = (cwd: string, path: string) => send<string>({ action: "read", cwd, path });
  const write = (cwd: string, path: string, content: string) => send<null>({ action: "write", cwd, path, content });
  const evaluate = (cwd: string, condition: Condition) => send<Evaluation>({ action: "evaluate", cwd, condition });
  return { read, write, evaluate,
    get submittedRequests() { return submittedRequests; },
    async readMany(cwd: string, paths: readonly string[]): Promise<FileRead[]> {
      if (!paths.length || paths.length > 8) throw new Error("批量读取须为一到八个文件");
      if (batch) return send<FileRead[]>({ action: "read_many", cwd, paths });
      const results: FileRead[] = [];
      for (const path of paths) {
        try { results.push({ content: await read(cwd, path) }); }
        catch (error) { results.push({ error: (error as Error).message }); }
      }
      return results;
    },
    async writeMany(cwd: string, files: readonly FileWrite[], condition?: Condition): Promise<Evaluation | undefined> {
      if (!files.length || files.length > 8) throw new Error("批量写入须为一到八个文件");
      if (batch) return (await send<{ evaluation: Evaluation | null }>({ action: "write_many", cwd, files: files.map(({ path, content }) => ({ path, content })), condition })).evaluation ?? undefined;
      for (const file of files) await write(cwd, file.path, file.content);
      return condition ? evaluate(cwd, condition) : undefined;
    },
  };
}
let cached: { port: string | undefined; token: string | undefined; version: string; client: ReturnType<typeof researchFileClient> } | undefined;
/** 仅支持该能力的桌面父进程会注入标识；未注入时使用既有独立 Node 执行路径。 */
export function nativeResearchFiles(env = process.env) {
  if (env.YUNFENG_RESEARCH_NATIVE === undefined) return undefined;
  const version = env.YUNFENG_RESEARCH_NATIVE;
  if (version !== "1" && version !== "2") throw new Error("科研执行能力标识无效");
  const port = env.YUNFENG_APP_PORT, token = env.YUNFENG_APP_TOKEN;
  if (cached && cached.port === port && cached.token === token && cached.version === version) return cached.client;
  const call = desktopConnection<ResearchEnvelope>(port, token, "科研执行", version === "2" ? 4 * 1024 * 1024 : 512 * 1024);
  if (!call) throw new Error("科研执行连接未配置");
  const client = researchFileClient(call, version === "2");
  cached = { port, token, version, client };
  return client;
}
