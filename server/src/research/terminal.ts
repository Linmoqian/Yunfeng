/* 科研命令适配：结构化 Rust PTY，独立 Server 保留无 shell 子进程。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { StringDecoder } from "node:string_decoder";
import { terminalConnection, type TerminalChunk } from "../agent/terminal-client.js";
import { toolArbiter, toolResources } from "./tool-arbiter.js";
import type { Step } from "./types.js";
async function nodeCommand(step: Extract<Step, { action: "run_command" }>, cwd: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(step.program, step.args, { cwd, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (force: boolean) => {
      if (!child.pid) return;
      try { process.platform === "win32" ? child.kill(force ? "SIGKILL" : "SIGTERM") : process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM"); } catch { /* 已退出。 */ }
    };
    const abort = () => { kill(false); killTimer = setTimeout(() => kill(true), 3000); killTimer.unref(); };
    signal.addEventListener("abort", abort, { once: true });
    const collect = (chunk: Buffer) => { output = (output + chunk.toString("utf8")).slice(-65536); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("exit", () => { if (process.platform !== "win32") kill(true); });
    child.once("close", (code) => {
      // 父命令退出后清理同组残留进程；不允许作业偷偷转为后台守护进程。
      if (process.platform !== "win32") kill(true);
      signal.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
      if (signal.aborted) reject(new Error("实验已取消或超时"));
      else if (code !== 0) reject(new Error(`命令退出码 ${code}\n${output}`));
      else resolve(output);
    });
    if (signal.aborted) abort();
  });
}

function nativeVersion(): string | undefined {
  const version = process.env.YUNFENG_RESEARCH_NATIVE;
  if (version !== undefined && !["1", "2", "3"].includes(version)) throw new Error("科研执行能力标识无效");
  return version;
}

/** 未知作业恢复时仅回收已绑定进程，不重新启动命令。 */
export async function stopResearchJob(jobId: string): Promise<void> {
  if (nativeVersion() !== "3") return;
  const call = terminalConnection();
  if (!call) throw new Error("TERMINAL_CLEANUP_FAILED：科研终端未配置，无法确认进程回收");
  try { await call({ action: "stopJob", jobId }); }
  catch { throw new Error("TERMINAL_CLEANUP_FAILED：无法确认科研进程已回收，请核对内置终端"); }
}

/** 调用身份绑定具体步骤；连接中断不重放启动，也不改走 Node。 */
export function runCommand(step: Extract<Step, { action: "run_command" }>, cwd: string, signal: AbortSignal, jobId: string): Promise<string> {
  return toolArbiter.run({ tool: "terminal", resources: toolResources(cwd, [], true), signal }, async () => {
    if (nativeVersion() !== "3") return nodeCommand(step, cwd, signal);
    const call = terminalConnection();
    if (!call) throw new Error("科研 Rust 终端未配置");
    let id: string;
    try { ({ id } = await call<{ id: string }>({ action: "run", cwd, program: step.program, args: step.args, jobId })); }
    catch (error) { await stopResearchJob(jobId); throw error; }
    let cursor = 0, output = "";
    const decoder = new StringDecoder("utf8");
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await call<TerminalChunk>({ action: "read", id, cursor });
        if (chunk.truncated) output = (output + "\n[终端输出已截断]\n").slice(-65536);
        output = (output + decoder.write(Buffer.from(chunk.data))).slice(-65536); cursor = chunk.cursor;
        if (chunk.failed) throw new Error("科研终端输出读取失败");
        if (chunk.closed && chunk.exitCode !== null) {
          output = (output + decoder.end()).slice(-65536);
          if (chunk.exitCode !== 0) throw new Error(`命令退出码 ${chunk.exitCode}\n${output}`);
          return output;
        }
        if (chunk.exitCode !== null) await call({ action: "stop", id });
        await delay(chunk.data.length ? 10 : 100, undefined, { signal });
      }
    } finally {
      // 退出后仍清理同组后代；保留 Runtime 中的只读输出供桌面回放。
      try {
        await call({ action: "stop", id });
        await call({ action: "release", id });
      } catch { throw new Error("TERMINAL_CLEANUP_FAILED：无法确认科研进程已回收，请核对内置终端"); }
    }
  });
}
