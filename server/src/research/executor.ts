/* 有界实验作业执行器：无 shell，完成事件、超时与退出回收。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { spawn } from "node:child_process";
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { projectPath, evaluate } from "./project.js";
import type { Plan, Result, Step } from "./types.js";

function runCommand(step: Extract<Step, { action: "run_command" }>, cwd: string, signal: AbortSignal): Promise<string> {
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

export class JobExecutor {
  private readonly jobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private closed = false;
  start(id: string, cwd: string, plan: Plan, completed: (result: Result) => Promise<void>): Result {
    if (this.closed || this.jobs.size >= 4 || this.jobs.has(id)) throw new Error("实验作业容量已满或作业重复");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
    timeout.unref();
    const done = Promise.resolve().then(async () => {
      let result: Result;
      try {
        let output = "";
        for (const step of plan.steps) {
          controller.signal.throwIfAborted();
          if (step.action === "run_command") output = (output + await runCommand(step, cwd, controller.signal)).slice(-65536);
          else {
            const target = await projectPath(cwd, step.path);
            await mkdir(dirname(target), { recursive: true });
            await projectPath(cwd, step.path);
            const temporary = `${target}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporary, step.content, { flag: "wx" });
              controller.signal.throwIfAborted();
              await projectPath(cwd, step.path);
              await rename(temporary, target);
            } finally { await unlink(temporary).catch(() => {}); }
            output += `已写入 ${step.path}\n`;
          }
        }
        controller.signal.throwIfAborted();
        const evaluation = await evaluate(cwd, plan.success_condition);
        result = { job_id: id, status: evaluation.passed ? "succeeded" : "failed", output, evaluation };
      } catch (error) {
        result = { job_id: id, status: controller.signal.aborted ? "cancelled" : "failed", output: String((error as Error).message).slice(-65536) };
      }
      clearTimeout(timeout);
      try { await completed({ ...result, completedAt: new Date().toISOString() }); }
      finally { this.jobs.delete(id); }
    }).catch((error) => { console.error("[research] 作业结果保存失败", (error as Error).message); });
    this.jobs.set(id, { controller, done });
    return { job_id: id, status: "running" };
  }
  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) { job.controller.abort(); await job.done; }
  }
  async close(): Promise<void> {
    this.closed = true;
    const jobs = [...this.jobs.values()];
    jobs.forEach((job) => job.controller.abort());
    await Promise.allSettled(jobs.map((job) => job.done));
  }
}
