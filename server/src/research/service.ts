/* 科研任务编排：复用 TaskStore、审批和 SSE，管理停止、恢复与文件事件。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { getTaskContext } from "../task/task-context.js";
import { getMemoryContext } from "../plugins/memory/index.js";
import { ProjectCore, planAuthorized } from "./core.js";
import { piReasoner } from "./reasoner.js";
import { JobExecutor } from "./executor.js";
import { ResearchRuntime } from "./runtime.js";
import { projectPath, readProjectText } from "./project.js";
import { record, step, text } from "./validation.js";
import { createDecision } from "./decision/engine.js";
import type { Plan } from "./types.js";
import type { TaskCommand, TaskModelRef, TaskState } from "../task/types.js";

const phaseLabels = { OBSERVING: "观察项目", PLANNING: "制定计划", EXECUTING: "提交实验", WAITING: "等待事件", REFLECTING: "核对与反思", PAUSED: "已暂停", COMPLETED: "目标已验收", FAILED: "需要处理" };
export function publicResearchTask(task: TaskState) {
  return { ...task, ...(task.autonomy ? { autonomy: { ...task.autonomy, observation: undefined } } : {}) };
}
export class ResearchService {
  constructor(private readonly context = getTaskContext(), private readonly memory = getMemoryContext().service, private readonly reasoner = piReasoner) {}
  private readonly jobs = new JobExecutor();
  private readonly instances = new Map<string, { runtime: ResearchRuntime; controller: AbortController; watchers: FSWatcher[]; watchEpoch: number }>();
  private closed = false;

  async create(cwd: string, goal: string, model: TaskModelRef | undefined, options: Record<string, unknown>): Promise<TaskState> {
    text(goal, 10000);
    const root = await realpath(cwd);
    if (!(await stat(root)).isDirectory()) throw new Error("科研范围必须是项目目录");
    if (this.closed || this.instances.size >= 4) throw new Error("自主任务容量已满，先暂停一个任务");
    const maxCycles = options.maxCycles ?? 20;
    if (!Number.isInteger(maxCycles) || Number(maxCycles) < 1 || Number(maxCycles) > 1000) throw new Error("轮次预算必须在 1 到 1000 之间");
    const decisionBudget = options.decisionBudget ?? 10;
    if (typeof decisionBudget !== "number" || !Number.isFinite(decisionBudget) || decisionBudget <= 0 || decisionBudget > 1000) throw new Error("决策成本预算必须在 0 到 1000 之间");
    const decisionModel = options.decisionModel === undefined ? undefined : record(options.decisionModel);
    const strategyModel = decisionModel ? { provider: text(decisionModel.provider, 200), modelId: text(decisionModel.modelId, 200) } : undefined;
    const permissions = options.permissions === undefined ? {} : record(options.permissions);
    const commands = permissions.commands ?? [];
    const roots = permissions.writeRoots ?? [".lin/experiments"];
    if (!Array.isArray(commands) || commands.length > 20 || !Array.isArray(roots) || roots.length > 8) throw new Error("科研权限清单无效");
    const parsedCommands = commands.map((cmd) => {
      const row = step({ ...record(cmd), action: "run_command" });
      if (row.action !== "run_command") throw new Error("命令清单无效");
      return { program: row.program, args: row.args };
    });
    const writeRoots = roots.map((value) => text(value, 500));
    for (const path of writeRoots) await projectPath(root, path);
    const task = this.context.store.create({ cwd: root, sessionId: `research-${randomUUID()}`, title: goal.slice(0, 60), source: "task" });
    this.context.store.update(task.id, (s) => {
      s.mode = "research"; s.model = model; s.activeToolNames = ["observe", "plan", "execute", "reflect"];
      s.autonomy = { schemaVersion: 1, goal, phase: "OBSERVING", cycle: 0, maxCycles: Number(maxCycles), reason: "开始观察项目", permissions: { commands: parsedCommands, writeRoots }, decision: createDecision(goal, decisionBudget), ...(strategyModel ? { decisionModel: strategyModel } : {}) };
    });
    await this.message(task.id, goal, "user");
    this.start(task.id);
    return task;
  }

  private start(id: string): void {
    if (this.instances.has(id)) return;
    if (this.closed || this.instances.size >= 4) {
      this.context.store.update(id, (s) => { s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "等待自主任务空位后手动继续"; s.status = "waiting_input"; });
      return;
    }
    const task = this.context.store.get(id)!;
    const controller = new AbortController();
    let runtime: ResearchRuntime;
    const core = new ProjectCore(() => this.context.store.get(id)!, this.reasoner(task.cwd, task.model), this.memory, this.jobs, controller.signal, (result) => runtime.receive(result), this.reasoner(task.cwd, task.autonomy?.decisionModel ?? task.model));
    runtime = new ResearchRuntime(core, {
      read: () => this.context.store.get(id)!,
      save: async (change) => {
        this.context.store.update(id, (s) => {
          change(s.autonomy!);
          const phase = s.autonomy!.phase;
          s.status = phase === "COMPLETED" ? "completed" : phase === "FAILED" ? "failed" : phase === "WAITING" || phase === "PAUSED" ? (s.autonomy!.approvalId ? "waiting_approval" : "waiting_input") : "running";
          s.phase = phase === "COMPLETED" ? "done" : phase === "REFLECTING" ? "verifying" : phase === "PLANNING" ? "planning" : "implementing";
          s.currentAction = `${phaseLabels[phase]}：${s.autonomy!.reason}`;
        });
        await this.context.hub.emit(id, "task_updated", publicResearchTask(this.context.store.get(id)!));
      },
      message: (value) => this.message(id, value),
      authorize: (plan) => planAuthorized(this.context.store.get(id)!, plan),
      requestApproval: (plan) => this.requestApproval(id, plan),
    });
    this.instances.set(id, { runtime, controller, watchers: [], watchEpoch: 0 });
    const listener = this.context.hub.subscribeTask(id, (event) => {
      if (event.type === "task_updated") void this.watchWaiting(id).catch((error) => console.error("[research] 文件事件订阅失败", (error as Error).message));
      if (["COMPLETED", "FAILED", "PAUSED"].includes(task.autonomy!.phase)) {
        controller.abort();
        this.instances.get(id)?.watchers.forEach((w) => w.close());
        void runtime.stop().finally(() => { if (this.instances.get(id)?.runtime === runtime) this.instances.delete(id); });
      }
    });
    controller.signal.addEventListener("abort", listener, { once: true });
    runtime.wake();
  }

  private async watchWaiting(id: string): Promise<void> {
    const item = this.instances.get(id), task = this.context.store.get(id);
    if (!item || !task?.autonomy) return;
    const epoch = ++item.watchEpoch;
    item.watchers.splice(0).forEach((watcher) => watcher.close());
    const state = task.autonomy;
    if (state.phase !== "WAITING" || state.jobId || state.approvalId) return;
    const paths = [...new Set([...(state.decision?.mission.condition ? [state.decision.mission.condition.path] : []), ...(state.plan?.success_condition ? [state.plan.success_condition.path] : []), ...(state.plan?.observe_paths ?? []), ".lin/experiments"])].slice(0, 3);
    const targets = new Set([task.cwd]);
    for (const path of paths) {
      try {
        let target = await projectPath(task.cwd, path);
        while (target !== task.cwd) {
          try { if ((await stat(target)).isDirectory()) break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          target = dirname(target);
        }
        targets.add(target);
      } catch { /* 不可观察的路径依靠项目根事件。 */ }
    }
    if (item.watchEpoch !== epoch || item.controller.signal.aborted || task.autonomy !== state || state.phase !== "WAITING" || state.jobId || state.approvalId) return;
    for (const target of targets) {
      const watcher = watch(target, (_kind, filename) => {
        if (!filename || /^(?:\.git|node_modules|\.DS_Store)$/.test(String(filename))) return;
        if (task.autonomy?.phase === "WAITING" && !task.autonomy.jobId && !task.autonomy.approvalId) item.runtime.wake();
      });
      watcher.on("error", () => watcher.close()); item.watchers.push(watcher);
    }
    // 订阅后回读一次，封闭观察结束到监听建立之间的事件间隙；没有周期轮询。
    const facts = state.observation?.facts.filter((f) => f.key.startsWith("file:")) ?? [];
    for (const path of new Set([...paths, ...facts.map((f) => f.key.slice(5))])) {
      try {
        const value = await readProjectText(task.cwd, path);
        if (value !== facts.find((f) => f.key === `file:${path}`)?.value && state.phase === "WAITING" && !state.jobId && !state.approvalId && !item.controller.signal.aborted) { item.runtime.wake(); return; }
      } catch { /* 文件仍不可读时不自旋。 */ }
    }
  }

  private async requestApproval(id: string, plan: Plan): Promise<void> {
    const signal = this.instances.get(id)?.controller.signal;
    if (!signal || signal.aborted) return;
    const item = await this.context.runtime.createIntervention(id, { kind: "confirm", title: "执行科研计划", message: `${plan.reason}\n\n${JSON.stringify({ steps: plan.steps, success_condition: plan.success_condition }, null, 2)}`, impact: "命令使用本机权限执行，请核对文件内容、项目脚本与参数" });
    if (signal.aborted) { this.context.runtime.invalidateInterventionsForTask(id); return; }
    this.context.store.update(id, (s) => { s.autonomy!.approvalId = item.id; });
    await this.context.hub.emit(id, "task_updated", publicResearchTask(this.context.store.get(id)!));
  }
  async resolve(id: string, requestId: string, approved: boolean): Promise<boolean> {
    const task = this.context.store.get(id);
    if (!task?.autonomy || task.autonomy.approvalId !== requestId || !this.context.store.listInterventions(id).some((i) => i.id === requestId && i.status === "pending")) return false;
    this.context.runtime.resolveIntervention(id, requestId, approved);
    this.context.store.update(id, (s) => { delete s.autonomy!.approvalId; if (approved) s.autonomy!.authorizedPlan = JSON.stringify(s.autonomy!.plan); });
    if (approved) this.instances.get(id)?.runtime.wake();
    else await this.pause(id, "工程师拒绝了实验计划");
    return true;
  }
  async command(id: string, command: TaskCommand): Promise<unknown> {
    const task = this.context.store.get(id)!;
    if (["prompt", "steer", "followUp"].includes(command.type)) {
      const message = text((command as { message: string }).message, 10000);
      const goal = text(`${task.autonomy!.goal}\n补充指令：${message}`, 10000);
      await this.pause(id, "更新目标");
      this.context.store.update(id, (s) => { s.autonomy!.goal = goal; });
      await this.message(id, message, "user");
      await this.resume(id);
    } else if (["abort", "complete", "archive"].includes(command.type)) {
      await this.pause(id, "工程师主动停止");
      if (command.type !== "abort") this.context.store.update(id, (s) => { s.status = command.type === "archive" ? "archived" : "completed"; });
    } else if (command.type === "retry" || command.type === "reopen") await this.resume(id);
    else if (command.type === "setModel") {
      await this.pause(id, "模型已切换，请继续任务");
      this.context.store.update(id, (s) => { s.model = { provider: command.provider, modelId: command.modelId }; });
    } else if (command.type === "getQueue" || command.type === "clearQueue") return { steering: [], followUp: [] };
    else throw new Error("科研模式仅通过四个核心接口运行，此命令不适用");
    await this.context.hub.emit(id, "task_updated", publicResearchTask(task));
    return { ok: true };
  }
  async pause(id: string, reason: string): Promise<void> {
    const item = this.instances.get(id), task = this.context.store.get(id)!;
    this.context.store.update(id, (s) => { s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = reason; s.status = "waiting_input"; delete s.autonomy!.authorizedPlan; });
    this.context.runtime.invalidateInterventionsForTask(id);
    this.context.store.update(id, (s) => { delete s.autonomy!.approvalId; });
    item?.controller.abort(); item?.watchers.forEach((w) => w.close());
    const stopping = item?.runtime.stop();
    if (task.autonomy?.jobId) await this.jobs.cancel(task.autonomy.jobId);
    await stopping;
    if (task.autonomy?.jobId && !task.autonomy.result) {
      this.context.store.update(id, (s) => { s.autonomy!.result = { job_id: s.autonomy!.jobId!, status: "interrupted", output: "作业未返回结果，核对项目后继续", completedAt: new Date().toISOString() }; });
    }
    this.instances.delete(id);
  }
  async resume(id: string): Promise<void> {
    await this.pause(id, "准备继续");
    if (this.closed || this.instances.size >= 4) throw new Error("自主任务容量已满");
    this.context.store.update(id, (s) => { s.autonomy!.phase = "OBSERVING"; s.autonomy!.maxCycles = Math.max(s.autonomy!.maxCycles, s.autonomy!.cycle + 20); });
    this.start(id);
  }
  recover(): void {
    for (const task of this.context.store.findAll().filter((s) => s.mode === "research" && s.autonomy?.schemaVersion === 1)) {
      const state = task.autonomy!;
      if (state.jobId && !state.result) {
        this.context.store.update(task.id, (s) => { s.autonomy!.result = { job_id: state.jobId!, status: "interrupted", output: "服务重启，作业结果未知；不会自动重跑", completedAt: new Date().toISOString() }; s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "作业中断，核对后继续"; s.status = "waiting_input"; });
      } else if (state.approvalId) {
        this.context.store.update(task.id, (s) => { delete s.autonomy!.approvalId; delete s.autonomy!.authorizedPlan; s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "重启后授权已失效"; });
      } else if (!["PAUSED", "FAILED", "COMPLETED"].includes(state.phase) && task.status !== "archived") this.start(task.id);
    }
  }
  conversation(id: string) {
    const messages = this.context.store.readEvents(id, 0).filter((e) => e.type === "message_completed").map((e) => (e.data as { message?: { id: string; role: string; content: string } }).message).filter(Boolean);
    return { context: { messages, entryIds: messages.map((m) => m!.id) } };
  }
  private async message(id: string, content: string, role = "assistant"): Promise<void> {
    await this.context.hub.emit(id, "message_completed", { message: { id: randomUUID(), role, content } });
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const id of [...this.instances.keys()]) await this.pause(id, "服务停止，手动继续后恢复");
    await this.jobs.close();
  }
}
let instance: ResearchService | undefined;
export function getResearchService(): ResearchService { return instance ??= new ResearchService(); }
