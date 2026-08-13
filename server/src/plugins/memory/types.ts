// 分层记忆数据模型（docs/03-个人工作流需求与系统设计.md 第 1 节）。
// 四类记忆用 kind 判别联合；公共元数据收敛到 MemoryBase。

export type MemoryKind = "preference" | "project_fact" | "procedure" | "episode";

export type MemorySource = "user_explicit" | "agent_inferred" | "observed";

export type MemoryConfidence = "candidate" | "confirmed";

export type MemoryScope = "global" | "project";

export interface MemoryBase {
  id: string;
  kind: MemoryKind;
  /** 记忆主体内容（procedure 用 steps 承载步骤，content 为概述） */
  content: string;
  /** 来源：用户明确要求 / Agent 推断 / 观察事实 */
  source: MemorySource;
  /** 生效范围：全局或单项目 */
  scope: MemoryScope;
  /** 候选 → 确认：可靠性核心字段 */
  confidence: MemoryConfidence;
  /** 检索关键词（写入时提取，第一版不做向量检索） */
  topics: string[];
  /** project 范围时的项目标识（如仓库路径 hash 或相对路径） */
  projectKey?: string;
  /** 来源引用（如沉淀该 episode 的 sessionId），用于去重与追溯 */
  refId?: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  schemaVersion: 1;
}

export interface PreferenceMemory extends MemoryBase {
  kind: "preference";
}

export interface ProjectFactMemory extends MemoryBase {
  kind: "project_fact";
}

export interface ProcedureMemory extends MemoryBase {
  kind: "procedure";
  /** 流程步骤（有序） */
  steps: string[];
}

export interface EpisodeMemory extends MemoryBase {
  kind: "episode";
  /** 任务经验教训 */
  lesson: string;
}

export type Memory = PreferenceMemory | ProjectFactMemory | ProcedureMemory | EpisodeMemory;

/** 写入入口：kind 之外的字段由 service 补齐（id/时间/置信度）。 */
export type NewMemory =
  | { kind: "preference" | "project_fact"; content: string }
  | { kind: "procedure"; content: string; steps: string[] }
  | { kind: "episode"; content: string; lesson: string };

export const CONFIRMED_USE_COUNT_THRESHOLD = 3;

export function isMemoryKind(value: unknown): value is MemoryKind {
  return value === "preference" || value === "project_fact" || value === "procedure" || value === "episode";
}
