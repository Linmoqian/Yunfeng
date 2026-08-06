// 任务领域协议：显示任务模型、命令、事件与 API 类型。
// 阶段 0 新增，作为前端 Agent 工作台的真实状态来源。

export type TaskStatus =
  | "running"
  | "waiting_input"
  | "waiting_approval"
  | "failed"
  | "completed"
  | "archived";

export type TaskPhase =
  | "understanding"
  | "planning"
  | "implementing"
  | "verifying"
  | "committing"
  | "done"
  | "unknown";

export type TaskSource = "task" | "legacy" | "history";

export interface TaskModelRef {
  provider: string;
  modelId: string;
}

export interface TaskState {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  cwd: string;
  title: string;
  source: TaskSource;
  status: TaskStatus;
  phase: TaskPhase;
  currentAction: string;
  attentionReason?: string;
  model?: TaskModelRef;
  thinkingLevel?: string;
  activeToolNames: string[];
  pendingApprovalIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  archivedAt?: string;
  lastEventSeq: number;
}

export type TaskCommand =
  | { type: "prompt"; message: string; images?: unknown[]; references?: unknown[] }
  | { type: "steer"; message: string; images?: unknown[]; references?: unknown[] }
  | { type: "followUp"; message: string; images?: unknown[]; references?: unknown[] }
  | { type: "abort" }
  | { type: "clearQueue" }
  | { type: "getQueue" }
  | { type: "retry" }
  | { type: "compact"; instructions?: string }
  | { type: "fork"; entryId: string }
  | { type: "setModel"; provider: string; modelId: string }
  | { type: "setThinkingLevel"; level: string }
  | { type: "setTools"; toolNames: string[] }
  | { type: "complete" }
  | { type: "reopen" }
  | { type: "archive" };

export type TaskEventName =
  | "task_snapshot"
  | "task_updated"
  | "message_delta"
  | "message_completed"
  | "tool_started"
  | "tool_updated"
  | "tool_finished"
  | "approval_requested"
  | "approval_resolved"
  | "queue_updated"
  | "context_updated"
  | "compaction_started"
  | "compaction_finished"
  | "git_changed"
  | "artifact_changed"
  | "run_failed"
  | "run_settled";

export interface TaskEvent<T = unknown> {
  id: string;
  taskId: string;
  seq: number;
  occurredAt: string;
  type: TaskEventName;
  data: T;
}

export type TaskEventListener = (event: TaskEvent) => void;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}

/** 创建一个结构化错误对象，供路由统一序列化。 */
export function apiError(
  code: string,
  message: string,
  options: { status?: number; retryable?: boolean; details?: unknown } = {},
): { code: string; message: string; retryable: boolean; details?: unknown; status: number } {
  return { code, message, retryable: options.retryable ?? false, details: options.details, status: options.status ?? 500 };
}

export function toApiErrorBody(error: { code: string; message: string; retryable: boolean; details?: unknown }): ApiErrorBody {
  return { error: { code: error.code, message: error.message, retryable: error.retryable, details: error.details } };
}

// ----------------------------------------------------------------------------
// 审批/介入请求
// ----------------------------------------------------------------------------

export type InterventionKind = "confirm" | "select" | "input";

export interface TaskIntervention {
  id: string;
  taskId: string;
  kind: InterventionKind;
  title: string;
  message: string;
  /** select 的可选值（confirm/input 为空）。 */
  options?: string[];
  /** input 的预填值。 */
  defaultValue?: string;
  /** confirm 的安全标签（如“git push”）。 */
  safeLabel?: string;
  /** 影响范围说明。 */
  impact?: string;
  status: "pending" | "resolved" | "timed_out";
  value?: string | boolean | null;
  createdAt: string;
  resolvedAt?: string;
}
