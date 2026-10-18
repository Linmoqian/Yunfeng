/* Rust PTY 私有通道客户端；连接和响应有界，命令绝不自动重放。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { desktopConnection } from "./desktop-client.js";
export type TerminalRequest = { action: "start"; cwd: string; command: string }
  | { action: "run"; cwd: string; program: string; args: string[]; jobId: string }
  | { action: "stopJob"; jobId: string }
  | { action: "read"; id: string; cursor: number } | { action: "stop" | "release"; id: string };
export interface TerminalChunk {
  data: number[]; cursor: number; truncated: boolean; closed: boolean; failed: boolean; exitCode: number | null;
}
export type TerminalCall = <T>(request: TerminalRequest) => Promise<T>;
/** 仅使用桌面父进程注入的 loopback 端口和令牌；未配置时不注册替代工具。 */
export function terminalConnection(env = process.env): TerminalCall | undefined {
  return desktopConnection<TerminalRequest>(env.YUNFENG_TERMINAL_PORT, env.YUNFENG_TERMINAL_TOKEN, "内置终端");
}
