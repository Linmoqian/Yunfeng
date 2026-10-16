/* 科研自治核心契约与可恢复检查点。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
export interface Fact { key: string; value: unknown; timestamp: string; source: string }
export interface State { facts: Fact[]; events: unknown[]; constraints: string[]; memory: unknown[] }
export type Step = { action: "write_file"; path: string; content: string }
  | { action: "run_command"; program: string; args: string[] }
  | { action: "update_component"; component: "research"; patch: import("./components.js").ResearchPatch };
export type Condition = { kind: "file_exists"; path: string }
  | { kind: "metric"; path: string; key: string; operator: ">" | ">=" | "<" | "<=" | "=="; value: number };
export interface Plan {
  decision: "act" | "wait" | "complete" | "pause";
  reason: string;
  steps: Step[];
  success_condition?: Condition;
  observe_paths?: string[];
  /** 由服务端决策层绑定，模型不能自行声明长期目标完成。 */
  node_id?: string;
  mission_complete?: boolean;
}
export interface Result {
  job_id: string;
  status: "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  output?: string;
  evaluation?: { passed: boolean; actual?: unknown; reason: string };
  completedAt?: string;
}
export interface Learning {
  summary: string;
  knowledge_update: { key: string; value: string }[];
  next_question: string;
}
/** 每个阶段只交换结构化结果，执行完成由外层事件唤醒。 */
export interface AgentCore {
  readonly decision?: import("./decision/types.js").DecisionState;
  observe(): Promise<State>;
  plan(state: State): Promise<Plan>;
  execute(plan: Plan): Promise<Result>;
  reflect(result: Result): Promise<Learning>;
}
export type ResearchPhase = "OBSERVING" | "PLANNING" | "EXECUTING" | "WAITING" | "REFLECTING" | "PAUSED" | "COMPLETED" | "FAILED";
export interface ResearchCheckpoint {
  schemaVersion: 1;
  goal: string;
  phase: ResearchPhase;
  cycle: number;
  maxCycles: number;
  reason: string;
  plan?: Plan;
  observation?: State;
  result?: Result;
  lastResult?: Result;
  learning?: Learning;
  jobId?: string;
  component?: import("./components.js").ResearchSnapshot;
  approvalId?: string;
  authorizedPlan?: string;
  decision?: import("./decision/types.js").DecisionState;
  decisionModel?: import("../task/types.js").TaskModelRef;
  trigger?: { signals: import("./hooks/types.js").HookSignal[]; receivedAt: string };
  permissions: { commands: { program: string; args: string[] }[]; writeRoots: string[] };
}
