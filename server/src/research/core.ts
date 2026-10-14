/* 四阶段核心：事实观察、Pi 决策、受控作业、候选知识沉淀。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import type { TaskState } from "../task/types.js";
import type { MemoryService } from "../plugins/memory/service.js";
import { projectPath, observeProject } from "./project.js";
import { relative } from "node:path";
import { parsePlan, parseLearning } from "./validation.js";
import type { Reasoner } from "./reasoner.js";
import type { AgentCore, Plan, Result, State } from "./types.js";
import type { JobExecutor } from "./executor.js";

export async function planAuthorized(task: TaskState, plan: Plan): Promise<boolean> {
  const config = task.autonomy!;
  let allowed = true;
  for (const step of plan.steps) {
    if (step.action === "write_file") {
      const target = await projectPath(task.cwd, step.path);
      const roots = await Promise.all(config.permissions.writeRoots.map((root) => projectPath(task.cwd, root)));
      if (!roots.some((root) => { const rel = relative(root, target); return rel && !rel.startsWith("..") && !rel.startsWith("/"); })) allowed = false;
    } else if (!config.permissions.commands.some((cmd) => cmd.program === step.program && JSON.stringify(cmd.args) === JSON.stringify(step.args))) allowed = false;
  }
  return allowed || config.authorizedPlan === JSON.stringify(plan);
}

export class ProjectCore implements AgentCore {
  constructor(private readonly task: () => TaskState, private readonly reason: Reasoner, private readonly memory: MemoryService,
    private readonly jobs: JobExecutor, private readonly signal: AbortSignal, private readonly completed: (result: Result) => Promise<void>) {}
  async observe(): Promise<State> {
    const task = this.task();
    const plan = task.autonomy?.plan;
    const paths = [...(plan?.observe_paths ?? []), ...(plan?.success_condition ? [plan.success_condition.path] : [])];
    const result = task.autonomy?.result ?? task.autonomy?.lastResult;
    const state = await observeProject(task.cwd, paths, this.memory.retrieve({ projectKey: task.cwd, limit: 8 }), result ? [result] : []);
    state.facts.push({ key: "task.status", value: task.status, timestamp: new Date().toISOString(), source: "TaskStore" });
    return state;
  }
  async plan(state: State): Promise<Plan> {
    const task = this.task();
    return parsePlan(await this.reason("plan", { goal: task.autonomy!.goal, state, previous: task.autonomy!.learning, permissions: task.autonomy!.permissions }, AbortSignal.any([this.signal, AbortSignal.timeout(120_000)])));
  }
  async execute(plan: Plan): Promise<Result> {
    const task = this.task();
    if (!await planAuthorized(task, plan)) throw new Error("实验计划尚未授权");
    this.signal.throwIfAborted();
    return this.jobs.start(task.autonomy!.jobId!, task.cwd, plan, this.completed);
  }
  async reflect(result: Result) {
    const task = this.task();
    const learning = parseLearning(await this.reason("reflect", { goal: task.autonomy!.goal, plan: task.autonomy!.plan, result }, AbortSignal.any([this.signal, AbortSignal.timeout(120_000)])));
    this.signal.throwIfAborted();
    // 重启重试反思时，用作业引用去重；候选知识不会被自动当作实测事实。
    if (!this.memory.list({ projectKey: task.cwd }).some((m) => m.refId === result.job_id)) {
      this.memory.add({ kind: "episode", content: learning.summary, lesson: JSON.stringify({ evaluation: result.evaluation, knowledge_update: learning.knowledge_update, next_question: learning.next_question }) },
        { source: "agent_inferred", scope: "project", projectKey: task.cwd, refId: result.job_id });
    }
    return learning;
  }
}
