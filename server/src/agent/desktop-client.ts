/* 桌面私有通道共用连接；单次调用、有界响应，副作用绝不自动重放。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { connect } from "node:net";
export type DesktopCall<R> = <T>(request: R) => Promise<T>;

export function desktopConnection<R>(portValue: string | undefined, token: string | undefined, label: string, maxBytes = 512 * 1024): DesktopCall<R> | undefined {
  if (!token && !portValue) return undefined;
  const port = Number(portValue);
  if (!token || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label}连接配置无效`);
  return <T>(request: R) => new Promise<T>((resolve, reject) => {
    const payload = `${JSON.stringify({ token, request })}\n`;
    if (Buffer.byteLength(payload) > 8 * 1024 * 1024) return reject(new Error(`${label}请求超出上限`));
    const socket = connect({ host: "127.0.0.1", port });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(deadline); socket.destroy();
      if (error) reject(error); else resolve(value as T);
    };
    const deadline = setTimeout(() => finish(new Error(`${label}连接超时，操作未自动重试`)), 5000);
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) return finish(new Error(`${label}响应超出上限`));
      chunks.push(chunk);
      if (!chunk.includes(10)) return;
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (response?.error) return finish(new Error(`${label}操作失败（${String(response.error.code).replace(/[^A-Z_]/g, "").slice(0, 32)}）`));
        if (!response || !Object.hasOwn(response, "result")) return finish(new Error(`${label}响应无效`));
        finish(undefined, response.result as T);
      } catch { finish(new Error(`${label}响应无效`)); }
    });
    socket.on("error", () => finish(new Error(`${label}连接中断，请检查桌面应用`)));
    socket.on("close", () => finish(new Error(`${label}连接已关闭`)));
  });
}
