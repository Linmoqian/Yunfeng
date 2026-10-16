/* 四阶段核心：真实观察、目标树选点与 Pi 规划、受控作业、候选知识沉淀。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import type { TaskState } from "../task/types.js";
import type { MemoryService } from "../plugins/memory/service.js";
import { projectPath, evaluate } from "./project.js";
import { buildContext } from "./context.js";
import { relative } from "node:path";
import { parsePlan, parseLearning } from "./validation.js";
import type { Reasoner } from "./reasoner.js";
import type { AgentCore, Plan, Result, State } from "./types.js";
import type { JobExecutor } from "./executor.js";
import { createDecision, decide } from "./decision/engine.js";
import { parseProposal } from "./decision/proposal.js";
import type { DecisionState } from "./decision/types.js";
import type { ResearchPatch } from "./components.js";

export async function planAuthorized(task: TaskState, plan: Plan): Promise<boolean> {
  const config = task.autonomy!;
  let allowed = true;
  for (const step of plan.steps) {
    if (step.action === "write_file") {
      const target = await projectPath(task.cwd, step.path);
      const roots = await Promise.all(config.permissions.writeRoots.map((root) => projectPath(task.cwd, root)));
      if (!roots.some((root) => { const rel = relative(root, target); return rel && !rel.startsWith("..") && !rel.startsWith("/"); })) allowed = false;
    } else if (step.action === "update_component") await projectPath(task.cwd, step.patch.source);
    else if (!config.permissions.commands.some((cmd) => cmd.program === step.program && JSON.stringify(cmd.args) === JSON.stringify(step.args))) allowed = false;
  }
  return allowed || config.authorizedPlan === JSON.stringify(plan);
}

export class ProjectCore implements AgentCore {
  decision?: DecisionState;
  constructor(private readonly task: () => TaskState, private readonly reason: Reasoner, private readonly memory: MemoryService,
    private readonly jobs: JobExecutor, private readonly signal: AbortSignal, private readonly completed: (result: Result) => Promise<void>,
    private readonly strategy: Reasoner = reason,
    private readonly updateComponent?: (patch: ResearchPatch, signal: AbortSignal) => Promise<void>) {}
  async observe(): Promise<State> {
    const task = this.task();
    return buildContext(task, this.memory.retrieve({ projectKey: task.cwd, limit: 8 }));
  }
  async plan(state: State): Promise<Plan> {
    const task = this.task();
    const checkpoint = task.autonomy!;
    let tree = structuredClone(checkpoint.decision ?? createDecision(checkpoint.goal));
    if (tree.mission.objective !== checkpoint.goal) {
      const budget = tree.budget;
      tree = createDecision(checkpoint.goal, budget.limit); tree.budget.spent = budget.spent;
    }
    this.decision = tree;
    const complete = (): Plan => {
      tree.horizon = []; delete tree.selectedId; tree.reason = "长期目标实测验收已通过";
      return { decision: "complete", reason: tree.reason, steps: [], success_condition: tree.mission.condition!, mission_complete: true };
    };
    if (tree.mission.condition && (await evaluate(task.cwd, tree.mission.condition)).passed) return complete();
    const proposal = parseProposal(await this.strategy("decide", { goal: checkpoint.goal, state, tree, previous: checkpoint.learning }, AbortSignal.any([this.signal, AbortSignal.timeout(120_000)])));
    if (proposal.mission_condition) await projectPath(task.cwd, proposal.mission_condition.path);
    for (const path of proposal.observe_paths) await projectPath(task.cwd, path);
    tree = decide(tree, proposal); this.decision = tree;
    if (tree.mission.condition && (await evaluate(task.cwd, tree.mission.condition)).passed) return complete();
    if (proposal.decision === "wait") return { decision: "wait", reason: proposal.reason, steps: [], observe_paths: [...(tree.mission.condition ? [tree.mission.condition.path] : []), ...proposal.observe_paths].slice(0, 8) };
    if (proposal.decision !== "select" || !tree.selectedId || !tree.mission.condition) return { decision: "pause", reason: !tree.mission.condition ? `需要工程师明确长期目标的实测验收条件：${proposal.reason}` : proposal.decision === "complete" ? "决策模型声明完成，但长期目标实测验收未通过" : tree.reason, steps: [] };
    const node = tree.nodes.find((n) => n.id === tree.selectedId)!;
    const plan = parsePlan(await this.reason("plan", { goal: node.objective, mission: tree.mission, node, state, previous: checkpoint.learning, permissions: checkpoint.permissions }, AbortSignal.any([this.signal, AbortSignal.timeout(120_000)])));
    return { ...plan, node_id: node.id };
  }
  async execute(plan: Plan): Promise<Result> {
    const task = this.task();
    if (!await planAuthorized(task, plan)) throw new Error("实验计划尚未授权");
    this.signal.throwIfAborted();
    return this.jobs.start(task.autonomy!.jobId!, task.cwd, plan, this.completed, this.updateComponent);
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
