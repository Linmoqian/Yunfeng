// 移动端薄客户端协议类型：镜像电脑侧 yunfeng-server / yunfeng-gateway 的任务契约。
// 后端事实来源在电脑侧，这里只定义 API 边界类型。

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

export interface TaskModelRef {
  provider: string;
  modelId: string;
}

export interface TaskState {
  schemaVersion: number;
  id: string;
  sessionId: string;
  cwd: string;
  title: string;
  source: "task" | "legacy" | "history";
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
  | { type: "prompt"; message: string }
  | { type: "steer"; message: string }
  | { type: "followUp"; message: string }
  | { type: "abort" }
  | { type: "retry" }
  | { type: "setModel"; provider: string; modelId: string }
  | { type: "complete" }
  | { type: "reopen" }
  | { type: "archive" };

export interface TaskListResponse {
  tasks: TaskState[];
  nextCursor?: string;
  total: number;
}

export interface TaskStreamEvent {
  id?: string;
  taskId?: string;
  seq?: number;
  type: string;
  data?: unknown;
}

export interface SessionMessage {
  id?: string;
  role: string;
  content: unknown;
  timestamp?: string | number;
  [key: string]: unknown;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

export interface ModelsData {
  models: Record<string, string>;
  modelList: ModelOption[];
  defaultModel: { provider: string; modelId: string } | null;
  thinkingLevels: Record<string, string[]>;
  thinkingLevelMaps: Record<string, Record<string, string | null>>;
  thinkingLevelPins: Record<string, string>;
  modelError?: string;
  modelScopeWarnings?: string[];
}

export interface GatewayHealth {
  ok: boolean;
  service: string;
  version: string;
  auth: { required: boolean; header: string };
  upstream: { url: string; reachable: boolean };
  allowedPaths: string[];
}

// ---- 移动后端（配对 + 远程桌面）----
export interface PairResult {
  deviceId: string;
  token: string;
}

export interface DesktopInput {
  kind: "move" | "click" | "scroll" | "key";
  x?: number;
  y?: number;
  button?: "left" | "right";
  dy?: number;
  keyCode?: number;
  down?: boolean;
}

export interface DesktopFrame {
  type: "desktop.frame";
  seq: number;
  mime: string;
  data: string;
}
