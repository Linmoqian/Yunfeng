/* 有界实验作业执行器：无 shell，完成事件、超时与退出回收。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { runCommand } from "./terminal.js";
import { withToolScope, toolArbiter } from "./tool-arbiter.js";
import { readText, modifyText } from "./text-tools.js";
import { evaluate } from "./project.js";
import { writeExecutionFiles } from "./execution-files.js";
import type { Plan, Result } from "./types.js";
import type { ResearchPatch } from "./components.js";

export class JobExecutor {
  private readonly jobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private closed = false;
  start(id: string, cwd: string, plan: Plan, completed: (result: Result) => Promise<void>, updateComponent?: (patch: ResearchPatch, signal: AbortSignal) => Promise<void>, focusComponent?: (target: string) => Promise<string>, authorize?: () => Promise<void>, horizon?: (domain: import("./horizon.js").HorizonDomain) => Promise<unknown>): Result {
    if (this.closed || this.jobs.size >= 4 || this.jobs.has(id)) throw new Error("实验作业容量已满或作业重复");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60_000);
    timeout.unref();
    const done = Promise.resolve().then(async () => {
      let result: Result;
      try {
        result = await withToolScope({ signal: controller.signal, authorize }, async () => {
          let output = "";
          let evaluation: Result["evaluation"];
          for (let index = 0; index < plan.steps.length; index++) {
            const step = plan.steps[index]!;
            controller.signal.throwIfAborted();
            if (step.action === "read_file") {
              output = (output + "\n" + JSON.stringify({ path: step.path, ...await readText(cwd, step.path, step.start_line, step.line_count) })).slice(-65536);
            } else if (step.action === "patch_file") {
              output = (output + "\n" + JSON.stringify({ path: step.path, ...await modifyText(cwd, step.path, step.old_text, step.new_text, controller.signal) })).slice(-65536);
            } else if (step.action === "read_horizon") {
              if (!horizon) throw new Error("视界未连接当前任务");
              output = (output + "\n" + JSON.stringify(await horizon(step.domain))).slice(-65536);
            } else if (step.action === "focus_component") {
              if (!focusComponent) throw new Error("关系图组件未连接");
              output = (output + "\n" + await toolArbiter.run({ tool: "horizon", resources: [{ key: `component:${cwd}`, write: true }] }, () => focusComponent(step.target))).slice(-65536);
            } else if (step.action === "run_command") output = (output + await runCommand(step, cwd, controller.signal, `${id}:${index}`)).slice(-65536);
            else if (step.action === "update_component") {
              if (!updateComponent) throw new Error("科研组件未连接当前作业");
              await updateComponent(step.patch, controller.signal);
              output = (output + `\n已更新科研组件：${step.patch.source}`).slice(-65536);
            } else {
              const files = [step];
              while (files.length < 8 && plan.steps[index + 1]?.action === "write_file") files.push(plan.steps[++index] as typeof step);
              evaluation = await writeExecutionFiles(cwd, files, controller.signal, index === plan.steps.length - 1 ? plan.success_condition : undefined);
              output += files.map((file) => `已写入 ${file.path}\n`).join("");
            }
          }
          controller.signal.throwIfAborted();
          evaluation ??= await evaluate(cwd, plan.success_condition);
          return { job_id: id, status: evaluation.passed ? "succeeded" as const : "failed" as const, output, evaluation };
        });
      } catch (error) {
        result = { job_id: id, status: String(error).includes("TERMINAL_CLEANUP_FAILED") ? "interrupted" : controller.signal.aborted ? "cancelled" : "failed", output: String((error as Error).message).slice(-65536) };
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
