/* Pi bash 工具的 Rust PTY 执行适配；终端和 Agent 读取同一份输出。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { setTimeout as delay } from "node:timers/promises";
import { createBashToolDefinition } from "./sdk.js";
import type { BashOperations, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { terminalConnection, type TerminalCall, type TerminalChunk } from "./terminal-client.js";

/** 每次执行独立 PTY，最多 300 秒；中断会回收进程，完成输出保留给工作台查看。 */
export function terminalOperations(call: TerminalCall): BashOperations {
  return { exec: async (command, cwd, { onData, signal, timeout }) => {
    if (signal?.aborted) throw new Error("aborted");
    const seconds = timeout ?? 300;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 300) throw new Error("内置终端 timeout 必须在 0 到 300 秒之间");
    if (!command || Buffer.byteLength(command) > 16384 || command.includes("\0")) throw new Error("终端命令需为 1 至 16384 字节");
    const deadline = Date.now() + seconds * 1000;
    const { id } = await call<{ id: string }>({ action: "start", cwd, command });
    let cursor = 0;
    let finished = false;
    try {
      while (true) {
        if (signal?.aborted) throw new Error("aborted");
        if (Date.now() >= deadline) throw new Error(`timeout:${seconds}`);
        const chunk = await call<TerminalChunk>({ action: "read", id, cursor });
        if (chunk.truncated) onData(Buffer.from("\n[终端输出超过缓存上限，部分内容已截断]\n"));
        if (chunk.data.length) onData(Buffer.from(chunk.data));
        cursor = chunk.cursor;
        if (chunk.failed) throw new Error("内置终端输出读取失败");
        if (chunk.closed && chunk.exitCode !== null) { finished = true; return { exitCode: chunk.exitCode }; }
        await delay(chunk.data.length ? 10 : 100);
      }
    } finally {
      // 清理失败必须可见，避免把仍在运行的命令报告成已取消。
      if (!finished) await call({ action: "stop", id });
      await call({ action: "release", id });
    }
  } };
}
export function nativeTerminalTools(cwd: string) {
  const call = terminalConnection();
  if (!call || process.platform === "win32") return [];
  const tool = createBashToolDefinition(cwd, { operations: terminalOperations(call), exposeSessionEnvironment: false });
  tool.description += "\n通过应用内置 Rust 终端执行，过程可见。默认和最长超时均为300秒；工作目录来自当前会话。";
  // SDK 的 customTools 容器擦除了 schema 类型；定义与执行仍由同一 Pi 工厂校验。
  return [tool as unknown as ToolDefinition];
}
