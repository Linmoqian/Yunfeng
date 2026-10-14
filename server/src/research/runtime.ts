/* 事件驱动外层 Runtime：等待期间不占用模型循环，恢复不重放副作用。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { randomUUID } from "node:crypto";
import type { TaskState } from "../task/types.js";
import type { AgentCore, Plan, ResearchCheckpoint, ResearchPhase, Result } from "./types.js";
import { DecisionBlocked, feedback, reserveExecution } from "./decision/engine.js";
interface Ports {
  read(): TaskState;
  save(change: (state: ResearchCheckpoint) => void): Promise<void>;
  message(text: string): Promise<void>;
  authorize(plan: Plan): Promise<boolean>;
  requestApproval(plan: Plan): Promise<void>;
}
export class ResearchRuntime {
  private pumping: Promise<void> | null = null;
  private pending = false;
  private stopped = false;
  constructor(private readonly core: AgentCore, private readonly ports: Ports) {}
  private phase(phase: ResearchPhase, reason: string) { return this.ports.save((s) => { s.phase = phase; s.reason = reason; }); }
  wake(): void {
    if (this.stopped) return;
    this.pending = true;
    if (this.pumping) return;
    this.pumping = this.pump().catch(async (error) => {
      if (!this.stopped) await this.phase(error instanceof DecisionBlocked ? "PAUSED" : "FAILED", (error as Error).message);
    }).finally(() => { this.pumping = null; if (this.pending && !this.stopped) this.wake(); });
  }
  private async pump(): Promise<void> {
    while (this.pending && !this.stopped) {
      this.pending = false;
      let state = this.ports.read().autonomy!;
      if (["PAUSED", "COMPLETED", "FAILED"].includes(state.phase)) return;
      if (state.result && state.result.status !== "running") {
        await this.phase("REFLECTING", "核对结果并记录经验");
        const learning = await this.core.reflect(state.result);
        if (this.stopped) return;
        const complete = state.plan?.decision === "complete" && (state.plan.mission_complete || !state.decision) && state.result.evaluation?.passed;
        await this.ports.save((s) => { feedback(s, s.result!); s.learning = learning; s.lastResult = s.result; delete s.result; delete s.jobId; delete s.authorizedPlan; });
        await this.ports.message(`反思：${learning.summary}\n\n下一问题：${learning.next_question}`);
        if (complete) { await this.phase("COMPLETED", "目标验收条件已通过"); return; }
      } else if (state.jobId || state.approvalId) return;
      state = this.ports.read().autonomy!;
      if (state.authorizedPlan && state.plan) { await this.execute(state.plan); continue; }
      if (state.cycle >= state.maxCycles) { await this.phase("PAUSED", "本次自主工作轮次预算已用完"); return; }
      await this.phase("OBSERVING", "读取项目真实状态");
      const observation = await this.core.observe();
      if (this.stopped) return;
      await this.ports.save((s) => { s.observation = observation; s.cycle += 1; });
      await this.phase("PLANNING", "更新目标树，选择下一任务并规划");
      const plan = await this.core.plan(observation);
      if (this.stopped) return;
      await this.ports.save((s) => { s.plan = plan; if (this.core.decision) s.decision = structuredClone(this.core.decision); });
      const tree = this.ports.read().autonomy!.decision;
      const node = tree?.nodes.find((n) => n.id === plan.node_id);
      if (node) await this.ports.message(`决策：${node.objective}\n\n评分 ${node.priority}；估计收益 ${node.expected_gain}；成功概率估计 ${node.confidence}；相对成本 ${node.cost}；预算 ${tree!.budget.spent}/${tree!.budget.limit}`);
      const steps = plan.steps.map((step) => step.action === "write_file" ? `写入 ${step.path}` : `运行 ${step.program}，参数 ${JSON.stringify(step.args)}`).join("\n");
      await this.ports.message(`计划：${plan.reason}${steps ? `\n\n步骤：\n${steps}` : ""}${plan.success_condition ? `\n\n验收条件：${JSON.stringify(plan.success_condition)}` : ""}`);
      if (plan.decision === "wait") { await this.phase("WAITING", plan.reason); return; }
      if (plan.decision === "pause") { await this.phase("PAUSED", plan.reason); return; }
      if (!await this.ports.authorize(plan)) {
        await this.phase("WAITING", "等待实验计划授权");
        await this.ports.requestApproval(plan);
        return;
      }
      await this.execute(plan);
    }
  }
  private async execute(plan: Plan): Promise<void> {
    const jobId = randomUUID();
    // 在触发副作用之前持久化身份，崩溃后只标记中断，不自动重跑。
    await this.ports.save((s) => { reserveExecution(s, plan, jobId); s.jobId = jobId; s.phase = "EXECUTING"; s.reason = "提交实验作业"; });
    if (this.stopped) return;
    await this.core.execute(plan);
    if (!this.stopped) await this.phase("WAITING", "实验运行中，等待完成事件");
  }
  async receive(result: Result): Promise<void> {
    if (this.ports.read().autonomy?.jobId !== result.job_id) return;
    await this.ports.save((s) => { if (!s.result) s.result = result; });
    await this.ports.message(`实验结果：${result.status}\n\n${result.output ?? ""}\n\n验收：${result.evaluation?.reason ?? "未完成"}`);
    this.wake();
  }
  async stop(): Promise<void> { this.stopped = true; this.pending = false; await this.pumping; }
  async idle(): Promise<void> { await this.pumping; }
}
