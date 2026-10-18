/* 科研任务编排：复用 TaskStore、审批和 SSE，管理停止、恢复与文件事件。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import { summarizeMissing } from "./decision/presentation.js";
import { RelevanceAnalyzer } from "./relevance/analysis.js";
import { moveRelations } from "./decision/relations.js";
import { ResearchGraphComponent } from "./graph-component.js";
import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { getTaskContext } from "../task/task-context.js";
import { getMemoryContext } from "../plugins/memory/index.js";
import { ProjectCore, planAuthorized } from "./core.js";
import { PiResearchBridge } from "./hooks/pi-bridge.js";
import { observedPaths } from "./context.js";
import { parseResearchSkills, loadResearchSkills } from "./skills.js";
import { getAgentDir } from "../agent/sdk.js";
import { piReasoner } from "./reasoner.js";
import { JobExecutor } from "./executor.js";
import { ResearchRuntime } from "./runtime.js";
import { projectPath } from "./project.js";
import { record, step, text } from "./validation.js";
import { createDecision } from "./decision/engine.js";
import { HookLayer } from "./hooks/layer.js";
import { FileHooks } from "./hooks/files.js";
import { researchEvent } from "./hooks/types.js";
import { researchMessageRole } from "./messages.js";
import { researchComponents, settleResearchReports } from "./components.js";
import type { Plan } from "./types.js";
import { toolArbiter } from "./tool-arbiter.js";
import { stopResearchJob } from "./terminal.js";
import { taskHorizon } from "./horizon-ports.js";
import type { TaskCommand, TaskModelRef, TaskState } from "../task/types.js";

const phaseLabels = { OBSERVING: "观察项目", PLANNING: "制定计划", EXECUTING: "提交实验", WAITING: "等待事件", REFLECTING: "核对与反思", PAUSED: "已暂停", COMPLETED: "目标已验收", FAILED: "需要处理" };
export function publicResearchTask(task: TaskState) {
  return { ...task, ...(task.autonomy ? { autonomy: { ...task.autonomy, observation: undefined } } : {}) };
}
export class ResearchService {
  constructor(private readonly context = getTaskContext(), private readonly memory = getMemoryContext().service, private readonly reasoner = piReasoner, private readonly relevance = new RelevanceAnalyzer()) {}
  private readonly jobs = new JobExecutor();
  private readonly instances = new Map<string, { runtime: ResearchRuntime; controller: AbortController; hooks: HookLayer; files: FileHooks; bridge: PiResearchBridge }>();
  private closed = false;
  private readonly recovering = new Map<string, Promise<void>>();
  private readonly graphRequests = new Set<string>();
  private readonly graphAbort = new AbortController();
  private readonly graphs = new Map<string, ResearchGraphComponent>();
  horizon(id: string) {
    const read = () => {
      const task = this.context.store.get(id);
      if (!task?.autonomy || task.mode !== "research") throw new Error("科研任务不存在");
      return task;
    };
    return taskHorizon(read);
  }
  graph(id: string): ResearchGraphComponent {
    const task = this.context.store.get(id);
    if (!task?.autonomy || task.mode !== "research") throw new Error("科研任务不存在");
    let graph = this.graphs.get(id);
    if (!graph) { graph = new ResearchGraphComponent(() => this.context.store.get(id)!, Date.now, (node, parent, revision) => this.moveNode(id, node, parent, revision), (node, revision) => this.relateNode(id, node, revision), (revision) => this.summarizeNodes(id, revision)); this.graphs.set(id, graph); }
    return graph;
  }

  private async moveNode(id: string, node: string, parent: string, revision: number): Promise<void> {
    const task = this.context.store.get(id)!;
    if (task.lastEventSeq !== revision) throw new Error("GRAPH_CONFLICT：请重新读取关系图版本");
    if (this.instances.get(id)?.runtime.busy || task.autonomy?.jobId || task.autonomy?.approvalId || !["WAITING", "PAUSED", "COMPLETED", "FAILED"].includes(task.autonomy?.phase ?? "")) throw new Error("GRAPH_BUSY：等待当前科研阶段完成后再调整");
    if (!task.autonomy?.decision) throw new Error("目标树尚未建立");
    const decision = moveRelations(task.autonomy.decision, [{ node, parent }]);
    if (JSON.stringify(decision) === JSON.stringify(task.autonomy.decision)) return;
    this.context.store.update(id, (state) => { state.autonomy!.decision = decision; });
    await this.context.hub.emit(id, "task_updated", publicResearchTask(task));
  }

  private async relateNode(id: string, node: string, revision: number): Promise<void> {
    const task = this.context.store.get(id)!;
    const check = () => {
      if (this.closed || task.lastEventSeq !== revision) throw new Error("GRAPH_CONFLICT：请重新读取关系图版本");
      if (this.instances.get(id)?.runtime.busy) throw new Error("GRAPH_BUSY：等待当前科研阶段完成后再分析");
    };
    check();
    if (this.graphRequests.has(id) || this.graphRequests.size >= 4) throw new Error("GRAPH_BUSY：相关性分析正在进行，请稍后重试");
    if (!task.autonomy?.decision) throw new Error("目标树尚未建立");
    this.graphRequests.add(id);
    try {
      const decision = await this.relevance.analyze(task.autonomy.decision, node, this.reasoner(task.cwd, task.autonomy.decisionModel ?? task.model, { skills: task.autonomy.skills }), this.graphAbort.signal);
      check();
      if (JSON.stringify(decision) === JSON.stringify(task.autonomy.decision)) return;
      this.context.store.update(id, (state) => { state.autonomy!.decision = decision; });
      await this.context.hub.emit(id, "task_updated", publicResearchTask(task));
    } finally { this.graphRequests.delete(id); }
  }

  private async summarizeNodes(id: string, revision: number): Promise<void> {
    const task = this.context.store.get(id)!;
    const check = (request = true) => {
      if (this.closed || task.lastEventSeq !== revision) throw new Error("GRAPH_CONFLICT：请重新读取关系图版本");
      if (this.instances.get(id)?.runtime.busy || (request && this.graphRequests.has(id))) throw new Error("GRAPH_BUSY：等待当前科研阶段或组件操作完成");
    };
    check();
    if (!task.autonomy?.decision || this.graphRequests.size >= 4) throw new Error("节点摘要暂不可用");
    this.graphRequests.add(id);
    try {
      const decision = await summarizeMissing(task.autonomy.decision, this.reasoner(task.cwd, task.autonomy.decisionModel ?? task.model, { skills: task.autonomy.skills }), AbortSignal.any([this.graphAbort.signal, AbortSignal.timeout(45_000)]));
      check(false);
      if (JSON.stringify(decision) === JSON.stringify(task.autonomy.decision)) return;
      this.context.store.update(id, (state) => { state.autonomy!.decision = decision; });
      await this.context.hub.emit(id, "task_updated", publicResearchTask(task));
    } finally { this.graphRequests.delete(id); }
  }

  async create(cwd: string, goal: string, model: TaskModelRef | undefined, options: Record<string, unknown>): Promise<TaskState> {
    text(goal, 10000);
    const root = await realpath(cwd);
    if (!(await stat(root)).isDirectory()) throw new Error("科研范围必须是项目目录");
    if (this.closed || this.instances.size >= 4) throw new Error("自主任务容量已满，先暂停一个任务");
    const skills = parseResearchSkills(options.skills);
    await loadResearchSkills(root, getAgentDir(), skills);
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
      s.autonomy = { schemaVersion: 1, goal, phase: "OBSERVING", cycle: 0, maxCycles: Number(maxCycles), reason: "开始观察项目", ...(skills.length ? { skills } : {}), permissions: { commands: parsedCommands, writeRoots }, decision: createDecision(goal, decisionBudget), ...(strategyModel ? { decisionModel: strategyModel } : {}) };
    });
    await this.message(task.id, goal, "user");
    this.start(task.id);
    return task;
  }

  private start(id: string, action: "started" | "resumed" | "recovered" = "started"): void {
    if (this.instances.has(id)) return;
    if (this.closed || this.instances.size >= 4) {
      this.context.store.update(id, (s) => { s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "等待自主任务空位后手动继续"; s.status = "waiting_input"; });
      return;
    }
    const task = this.context.store.get(id)!;
    const controller = new AbortController();
    let runtime: ResearchRuntime;
    const hooks = new HookLayer(() => task.autonomy!, (signals) => !runtime.busy && !task.autonomy!.approvalId && (!task.autonomy!.jobId || (!!task.autonomy!.result && signals.some((s) => s.event.kind === "job_completed" || s.event.kind === "lifecycle"))), (signals) => runtime.trigger(signals));
    const files = new FileHooks(() => task, (event) => { hooks.publish(event); }, (error) => {
      void this.pause(id, `项目 Hook 失效：${error.message}`).then(() => this.context.hub.emit(id, "task_updated", publicResearchTask(task))).catch((failure) => console.error("[research] Hook 停止失败", (failure as Error).message));
    });
    const bridge = new PiResearchBridge(id, () => observedPaths(task), (event) => hooks.publish(event));
    const resources = { skills: task.autonomy?.skills, bridge };
    const executeReason = this.reasoner(task.cwd, task.model, resources);
    const strategy = this.reasoner(task.cwd, task.autonomy?.decisionModel ?? task.model, resources);
    const core = new ProjectCore(() => this.context.store.get(id)!, executeReason, this.memory, this.jobs, controller.signal, async (result) => {
      if (await runtime.receive(result)) hooks.publish(researchEvent({ kind: "job_completed", jobId: result.job_id, status: result.status }));
    }, strategy, async (patch, signal) => {
      const jobId = task.autonomy!.jobId!;
      const components = researchComponents(task.cwd, jobId, () => task.autonomy!.component, async (view) => toolArbiter.run({ tool: "horizon", resources: [{ key: `component:${task.cwd}`, write: true }], signal }, async () => {
        signal.throwIfAborted(); controller.signal.throwIfAborted();
        if (task.autonomy!.jobId !== jobId) throw new Error("科研组件作业已失效");
        const previous = task.autonomy!.component;
        if (previous && JSON.stringify({ ...previous.state, updatedAt: undefined }) === JSON.stringify({ ...view, updatedAt: undefined })) return previous;
        const snapshot = { component: "research" as const, revision: (previous?.revision ?? 0) + 1, state: view };
        this.context.store.update(id, (s) => { s.autonomy!.component = snapshot;
          const node = s.autonomy!.decision?.nodes.find((n) => n.jobId === jobId);
          if (node) node.report = snapshot; });
        await this.context.hub.emit(id, "task_updated", publicResearchTask(task));
        return snapshot;
      }), signal);
      await components.patch("research", patch);
    }, async (target) => {
      const result = await this.graph(id).call({ action: "focus", component: "research-graph", target });
      return JSON.stringify(result);
    }, () => this.graph(id).status(), (tree, node, signal) => this.relevance.analyze(tree, node, strategy, signal), (domain) => this.horizon(id).read(domain, controller.signal), async (event) => { await this.context.hub.emit(id, event.type, event.data); });
    runtime = new ResearchRuntime(core, {
      read: () => this.context.store.get(id)!,
      save: async (change) => {
        const previousResult = this.context.store.get(id)!.autonomy!.result;
        const previousJob = this.context.store.get(id)!.autonomy!.jobId;
        this.context.store.update(id, (s) => {
          change(s.autonomy!);
          const phase = s.autonomy!.phase;
          s.status = phase === "COMPLETED" ? "completed" : phase === "FAILED" ? "failed" : phase === "WAITING" || phase === "PAUSED" ? (s.autonomy!.approvalId ? "waiting_approval" : "waiting_input") : "running";
          s.phase = phase === "COMPLETED" ? "done" : phase === "REFLECTING" ? "verifying" : phase === "PLANNING" ? "planning" : "implementing";
          s.currentAction = `${phaseLabels[phase]}：${s.autonomy!.reason}`;
        });
        const current = this.context.store.get(id)!.autonomy!;
        if (current.phase === "EXECUTING" && current.jobId !== previousJob) await this.context.runtime.beginChanges(id);
        if ((previousJob && !current.jobId) || (current.result && current.result !== previousResult && current.result.status !== "running")) await this.context.runtime.finishChanges(id);
        await this.context.hub.emit(id, "task_updated", publicResearchTask(this.context.store.get(id)!));
      },
      message: (value) => this.message(id, value),
      authorize: (plan) => planAuthorized(this.context.store.get(id)!, plan),
      requestApproval: (plan) => this.requestApproval(id, plan),
      settled: () => hooks.flush(),
    });
    this.instances.set(id, { runtime, controller, hooks, files, bridge });
    const listener = this.context.hub.subscribeTask(id, (event) => {
      if (event.type === "task_updated") files.refresh();
      if (["COMPLETED", "FAILED", "PAUSED"].includes(task.autonomy!.phase)) {
        controller.abort();
        hooks.close(); bridge.close();
        void Promise.all([runtime.stop(), files.close()]).finally(() => { if (this.instances.get(id)?.runtime === runtime) this.instances.delete(id); });
      }
    });
    controller.signal.addEventListener("abort", listener, { once: true });
    files.refresh();
    hooks.publish(researchEvent({ kind: "lifecycle", action }));
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
    if (approved) this.instances.get(id)?.hooks.publish(researchEvent({ kind: "approval_granted", requestId }));
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
  /** 本地受信适配器报告观察文件变化；暂停或不在观察范围时返回 false。 */
  notify(id: string, paths: readonly string[]): boolean {
    return this.instances.get(id)?.bridge.notify(paths) ?? false;
  }
  async pause(id: string, reason: string): Promise<void> {
    const item = this.instances.get(id), task = this.context.store.get(id)!;
    this.context.store.update(id, (s) => { s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = reason; s.status = "waiting_input"; delete s.autonomy!.authorizedPlan; });
    this.context.runtime.invalidateInterventionsForTask(id);
    this.context.store.update(id, (s) => { delete s.autonomy!.approvalId; });
    item?.controller.abort(); item?.hooks.close(); item?.bridge.close();
    const fileStopping = item?.files.close();
    const stopping = item?.runtime.stop();
    let cleanupError: unknown;
    try {
      const recovery = this.recovering.get(id);
      if (recovery) { this.recovering.delete(id); await recovery.catch(() => {}); }
      if (task.autonomy?.jobId) {
        await this.jobs.cancel(task.autonomy.jobId);
        await stopResearchJob(task.autonomy.jobId);
      }
    } catch (error) {
      cleanupError = error;
      this.context.store.update(id, (s) => { s.autonomy!.reason = (error as Error).message; });
    } finally {
      await stopping;
      await fileStopping;
      if (task.autonomy?.jobId && !task.autonomy.result) {
        this.context.store.update(id, (s) => { s.autonomy!.result = { job_id: s.autonomy!.jobId!, status: "interrupted", output: "作业未返回结果，核对项目后继续", completedAt: new Date().toISOString() }; settleResearchReports(s.autonomy!, s.autonomy!.result); });
      }
      this.instances.delete(id);
    }
    if (cleanupError) throw cleanupError;
  }

  async resume(id: string): Promise<void> {
    await this.pause(id, "准备继续");
    if (this.closed || this.instances.size >= 4) throw new Error("自主任务容量已满");
    this.context.store.update(id, (s) => { s.autonomy!.phase = "OBSERVING"; s.autonomy!.maxCycles = Math.max(s.autonomy!.maxCycles, s.autonomy!.cycle + 20); });
    this.start(id, "resumed");
  }
  recover(): void {
    for (const task of this.context.store.findAll().filter((s) => s.mode === "research" && s.autonomy?.schemaVersion === 1)) {
      const state = task.autonomy!;
      if (state.jobId && !state.result) {
        this.context.store.update(task.id, (s) => { s.autonomy!.result = { job_id: state.jobId!, status: "interrupted", output: "服务重启，作业结果未知；不会自动重跑", completedAt: new Date().toISOString() }; settleResearchReports(s.autonomy!, s.autonomy!.result); s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "作业中断，核对后继续"; s.status = "waiting_input"; });
        const recovery = stopResearchJob(state.jobId).catch((error) => {
          this.context.store.update(task.id, (s) => { s.autonomy!.reason = (error as Error).message; });
          throw error;
        });
        this.recovering.set(task.id, recovery);
        void recovery.catch(() => {});
      } else if (state.approvalId) {
        this.context.store.update(task.id, (s) => { delete s.autonomy!.approvalId; delete s.autonomy!.authorizedPlan; s.autonomy!.phase = "PAUSED"; s.autonomy!.reason = "重启后授权已失效"; });
      } else if (!["PAUSED", "FAILED", "COMPLETED"].includes(state.phase) && task.status !== "archived") this.start(task.id, "recovered");
    }
  }
  conversation(id: string) {
    const messages = this.context.store.readEvents(id, 0).filter((e) => e.type === "message_completed").map((e) => (e.data as { message?: { id: string; role: string; content: string } }).message).filter(Boolean);
    return { context: { messages: messages.map((m) => ({ ...m!, role: researchMessageRole(m!.role, m!.content) })), entryIds: messages.map((m) => m!.id) } };
  }
  private async message(id: string, content: string, role = "assistant"): Promise<void> {
    await this.context.hub.emit(id, "message_completed", { message: { id: randomUUID(), role: researchMessageRole(role, content), content } });
  }
  async close(): Promise<void> {
    this.graphAbort.abort();
    this.closed = true;
    this.graphs.clear();
    const failures: unknown[] = [];
    for (const id of [...this.instances.keys()]) {
      try { await this.pause(id, "服务停止，手动继续后恢复"); } catch (error) { failures.push(error); }
    }
    await this.jobs.close();
    await Promise.allSettled(this.recovering.values());
    if (failures.length) throw new Error("TERMINAL_CLEANUP_FAILED：部分科研终端未确认回收，请核对内置终端");
  }
}
let instance: ResearchService | undefined;
export function getResearchService(): ResearchService { return instance ??= new ResearchService(); }
