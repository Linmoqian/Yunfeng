/* 复用桌面私有通道执行有界文件操作；无后台进程、无自动重试和故障回退。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { desktopConnection, type DesktopCall } from "../agent/desktop-client.js";
import type { Condition, Result } from "./types.js";
type Request = { action: "read"; cwd: string; path: string }
  | { action: "write"; cwd: string; path: string; content: string }
  | { action: "evaluate"; cwd: string; condition: Condition };
export type ResearchEnvelope = { action: "research"; request: Request };
export function researchFileClient(call: DesktopCall<ResearchEnvelope>) {
  let active = 0;
  async function send<T>(request: Request): Promise<T> {
    if (active >= 8) throw new Error("科研文件请求容量已满");
    active++;
    try { return await call<T>({ action: "research", request }); }
    finally { active--; }
  }
  return {
    read: (cwd: string, path: string) => send<string>({ action: "read", cwd, path }),
    write: (cwd: string, path: string, content: string) => send<null>({ action: "write", cwd, path, content }),
    evaluate: (cwd: string, condition: Condition) => send<NonNullable<Result["evaluation"]>>({ action: "evaluate", cwd, condition }),
  };
}
let cached: { port: string | undefined; token: string | undefined; client: ReturnType<typeof researchFileClient> } | undefined;
/** 仅支持该能力的桌面父进程会注入标识；未注入时使用既有独立 Node 执行路径。 */
export function nativeResearchFiles(env = process.env) {
  if (env.YUNFENG_RESEARCH_NATIVE === undefined) return undefined;
  if (env.YUNFENG_RESEARCH_NATIVE !== "1") throw new Error("科研执行能力标识无效");
  const port = env.YUNFENG_APP_PORT, token = env.YUNFENG_APP_TOKEN;
  if (cached && cached.port === port && cached.token === token) return cached.client;
  const call = desktopConnection<ResearchEnvelope>(port, token, "科研执行");
  if (!call) throw new Error("科研执行连接未配置");
  const client = researchFileClient(call);
  cached = { port, token, client };
  return client;
}
