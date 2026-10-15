/* Rust PTY 私有通道客户端；连接和响应有界，命令绝不自动重放。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { connect } from "node:net";
export type TerminalRequest = { action: "start"; cwd: string; command: string }
  | { action: "read"; id: string; cursor: number } | { action: "stop" | "release"; id: string };
export interface TerminalChunk {
  data: number[]; cursor: number; truncated: boolean; closed: boolean; failed: boolean; exitCode: number | null;
}
export type TerminalCall = <T>(request: TerminalRequest) => Promise<T>;
/** 仅使用桌面父进程注入的 loopback 端口和令牌；未配置时不注册替代工具。 */
export function terminalConnection(env = process.env): TerminalCall | undefined {
  const port = Number(env.YUNFENG_TERMINAL_PORT);
  const token = env.YUNFENG_TERMINAL_TOKEN;
  if (!token && !env.YUNFENG_TERMINAL_PORT) return undefined;
  if (!token || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("内置终端连接配置无效");
  return <T>(request: TerminalRequest) => new Promise<T>((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(deadline); socket.destroy();
      if (error) reject(error); else resolve(value as T);
    };
    const deadline = setTimeout(() => finish(new Error("内置终端连接超时，命令未自动重试")), 5000);
    socket.on("connect", () => socket.write(`${JSON.stringify({ token, request })}\n`));
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 512 * 1024) return finish(new Error("内置终端响应超出上限"));
      chunks.push(chunk);
      if (!chunk.includes(10)) return;
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (response.error) return finish(new Error(`内置终端操作失败（${String(response.error.code).replace(/[^A-Z_]/g, "").slice(0, 32)}）`));
        finish(undefined, response.result as T);
      } catch { finish(new Error("内置终端响应无效")); }
    });
    socket.on("error", () => finish(new Error("内置终端连接中断，请检查桌面应用")));
    socket.on("close", () => finish(new Error("内置终端连接已关闭")));
  });
}
