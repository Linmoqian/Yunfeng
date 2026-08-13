// 任务领域 API 客户端：/api/tasks 系列 + 兼容旧 /api/sessions 浏览。
// 阶段 1：工作台以真实任务状态为准，旧会话保留浏览与懒关联导入。

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
  status: "running" | "waiting_input" | "waiting_approval" | "failed" | "completed" | "archived";
  phase: "understanding" | "planning" | "implementing" | "verifying" | "committing" | "done" | "unknown";
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
  | { type: "prompt"; message: string; images?: unknown[] }
  | { type: "steer"; message: string; images?: unknown[] }
  | { type: "followUp"; message: string; images?: unknown[] }
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

export interface TaskListResponse {
  tasks: TaskState[];
  nextCursor?: string;
  total: number;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  firstMessage: string;
  cwd: string | undefined;
  modified: string;
  messageCount: number;
  parentSessionId?: string;
}

export interface SessionUsageSnapshot {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

export interface SessionMessageSnapshot {
  role?: string;
  model?: string;
  provider?: string;
  usage?: SessionUsageSnapshot;
}

export interface SessionDetails {
  context?: {
    messages?: SessionMessageSnapshot[];
    model?: TaskModelRef;
    thinkingLevel?: string;
  };
}

export interface SessionRuntimeState {
  running: boolean;
  state?: {
    model?: { id: string; provider: string };
    thinkingLevel?: string;
    contextUsage?: {
      percent: number;
      contextWindow: number;
      tokens: number;
    } | null;
  };
}

export interface TaskStreamEvent {
  id?: string;
  taskId?: string;
  seq?: number;
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

export interface ModelSelection {
  provider: string;
  modelId: string;
}

export interface ModelCatalog {
  models: ModelOption[];
  defaultModel: ModelSelection | null;
  thinkingLevels: Record<string, string[]>;
  thinkingLevelPins: Record<string, string>;
}

export interface BrowsableDirectory {
  name: string;
  path: string;
}

export interface DirectoryBrowseResult {
  path: string;
  parentPath: string | null;
  directories: BrowsableDirectory[];
}
// 读取
// ---------------------------------------------------------------------------

export async function browseDirectories(
  path?: string,
  signal?: AbortSignal,
): Promise<DirectoryBrowseResult> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  const query = params.toString();
  const response = await fetch(`/api/cwd/browse${query ? `?${query}` : ""}`, { signal });
  return readJson<DirectoryBrowseResult>(response);
}

export interface TaskQuery {
  q?: string;
  project?: string;
  status?: string;
  archived?: "true" | "false";
  cursor?: string;
  limit?: number;
}

export async function loadTasks(query: TaskQuery = {}, signal?: AbortSignal): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.project) params.set("project", query.project);
  if (query.status) params.set("status", query.status);
  if (query.archived) params.set("archived", query.archived);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const queryString = params.toString();
  const response = await fetch(`/api/tasks${queryString ? `?${queryString}` : ""}`, { signal });
  return readJson<TaskListResponse>(response);
}

export async function loadTask(taskId: string, signal?: AbortSignal): Promise<TaskState> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { signal });
  const data = await readJson<{ task: TaskState }>(response);
  return data.task;
}

/** 旧会话列表（未导入任务前仅浏览用）。 */
export async function loadLegacySessions(signal?: AbortSignal): Promise<SessionSnapshot[]> {
  const response = await fetch("/api/sessions", { signal });
  const data = await readJson<{ sessions: SessionSnapshot[] }>(response);
  return data.sessions ?? [];
}

export async function loadSessionDetails(sessionId: string, signal?: AbortSignal): Promise<SessionDetails> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?deferMedia&deferThinking`, { signal });
  return readJson<SessionDetails>(response);
}

export async function loadSessionRuntimeState(sessionId: string, signal?: AbortSignal): Promise<SessionRuntimeState> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, { signal });
  return readJson<SessionRuntimeState>(response);
}

async function readConversation(response: Response): Promise<unknown[]> {
  const data = await readJson<{ context?: { messages?: unknown[]; entryIds?: string[] } }>(response);
  const messages = Array.isArray(data.context?.messages) ? data.context.messages : [];
  const entryIds = Array.isArray(data.context?.entryIds) ? data.context.entryIds : [];
  return messages.map((message, index) => ({
    ...(message && typeof message === "object" ? message : { content: message }),
    id: entryIds[index] ?? `message-${index}`,
  }));
}

export async function loadTaskConversation(taskId: string, signal?: AbortSignal): Promise<unknown[]> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/conversation?deferMedia`, { signal });
  return readConversation(response);
}

export async function loadSessionConversation(sessionId: string, signal?: AbortSignal): Promise<unknown[]> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}?deferMedia`, { signal });
  return readConversation(response);
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

export async function createTask(
  cwd: string,
  message: string,
  model?: ModelSelection | null,
): Promise<{ task: TaskState; sessionId: string }> {
  return createTaskRequest({ cwd, message, model });
}

/** 以首条消息创建一段对话；未提供消息时仅兼容旧调用。 */
export async function createConversation(
  model?: ModelSelection | null,
  message?: string,
): Promise<{ task: TaskState; sessionId: string }> {
  return createTaskRequest({ model, message });
}

async function createTaskRequest({
  cwd,
  message,
  model,
}: {
  cwd?: string;
  message?: string;
  model?: ModelSelection | null;
}): Promise<{ task: TaskState; sessionId: string }> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(cwd ? { cwd } : {}),
      ...(message ? { message } : {}),
      ...(model ? { model: { provider: model.provider, modelId: model.modelId } } : {}),
    }),
  });
  const data = await readJson<{ task: TaskState; sessionId: string }>(response);
  if (!data.task?.id) throw new Error("服务器没有返回任务信息");
  return data;
}

/** 旧会话首次操作时懒关联：创建/返回对应任务记录。 */
export async function importLegacySession(sessionId: string): Promise<TaskState> {
  const response = await fetch("/api/tasks/import-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const data = await readJson<{ task: TaskState }>(response);
  return data.task;
}

export async function renameTask(taskId: string, name: string): Promise<TaskState> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await readJson<{ task: TaskState }>(response);
  return data.task;
}

export async function loadTaskInterventions(taskId: string, signal?: AbortSignal): Promise<unknown[]> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/interventions`, { signal });
  const data = await readJson<{ interventions?: unknown[] }>(response);
  return data.interventions ?? [];
}

export async function resolveIntervention(
  taskId: string,
  requestId: string,
  decision: "approve" | "reject",
  value?: string,
): Promise<void> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/interventions/${encodeURIComponent(requestId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, ...(value ? { value } : {}) }),
  });
  await readJson<{ ok: boolean }>(response);
}

// ---------------------------------------------------------------------------
// 任务 Git 闭环
// ---------------------------------------------------------------------------

export interface TaskGitSummary {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: Array<{ filePath: string; status: string }>;
  taskFiles: Array<{ filePath: string; status: string }>;
  baselineFiles: Array<{ filePath: string; status: string }>;
  baseline: string[];
}

export async function loadTaskGit(taskId: string, signal?: AbortSignal): Promise<TaskGitSummary> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/git`, { signal });
  const data = await readJson<{ git: TaskGitSummary }>(response);
  return data.git;
}

export async function loadTaskGitDiff(taskId: string, filePath: string, signal?: AbortSignal): Promise<{ supported: boolean; status?: string; patch?: string }> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/git/diff?path=${encodeURIComponent(filePath)}`, { signal });
  return readJson<{ supported: boolean; status?: string; patch?: string }>(response);
}

export async function commitTaskChanges(taskId: string, message: string): Promise<{ commitSha?: string; message?: string }> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/git/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  // 允许 409（被拒绝）也读取结构化错误
  const data = await readJson<{ ok: boolean; commit?: { commitSha?: string; message?: string } }>(response);
  return data.commit ?? {};
}

export async function requestTaskPush(taskId: string): Promise<{ approvalRequestId?: string; push?: { branch?: string; remote?: string } }> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/git`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readJson<{ ok: boolean; approvalRequestId?: string; push?: { branch?: string; remote?: string } }>(response);
}

export async function sendTaskCommand(taskId: string, command: TaskCommand): Promise<unknown> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await readJson<{ ok: boolean; result?: unknown }>(response);
  return data.result;
}

export interface TaskCapabilitiesResult {
  model: ModelSelection | null;
  thinkingLevel: string | null;
  activeTools: string[];
  tools: Array<{ name: string; active: boolean }>;
}

export async function loadTaskCapabilities(taskId: string, signal?: AbortSignal): Promise<TaskCapabilitiesResult> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/capabilities`, { signal });
  const data = await readJson<{ capabilities: TaskCapabilitiesResult }>(response);
  return data.capabilities;
}

// ---------------------------------------------------------------------------
// 事件订阅
// ---------------------------------------------------------------------------

/**
 * 任务详情事件流。带 Last-Event-ID 重连语义：
 * 断线后 EventSource 自动重连，服务端按最后 seq 补发。
 */
export function subscribeTaskEvents(
  taskId: string,
  onEvent: (event: TaskStreamEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
  source.onopen = () => onConnectionChange?.(true);
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as TaskStreamEvent);
    } catch {
      onConnectionChange?.(false);
    }
  };
  source.onerror = () => onConnectionChange?.(false);
  return () => source.close();
}

/**
 * 工作台任务摘要事件流：首帧 task_snapshot，之后是所有任务的状态事件。
 */
export function subscribeTaskSummary(
  onEvent: (event: TaskStreamEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const source = new EventSource("/api/tasks/events");
  source.onopen = () => onConnectionChange?.(true);
  source.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data) as TaskStreamEvent);
    } catch {
      onConnectionChange?.(false);
    }
  };
  source.onerror = () => onConnectionChange?.(false);
  return () => source.close();
}

// ---------------------------------------------------------------------------
// 兼容：模型目录
// ---------------------------------------------------------------------------

export async function loadModelCatalog(cwd?: string, signal?: AbortSignal): Promise<ModelCatalog> {
  const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const response = await fetch(`/api/models${query}`, { signal });
  const data = await readJson<{
    modelList?: ModelOption[];
    defaultModel?: ModelSelection | null;
    thinkingLevels?: Record<string, string[]>;
    thinkingLevelPins?: Record<string, string>;
  }>(response);
  return {
    models: Array.isArray(data.modelList) ? data.modelList : [],
    defaultModel: data.defaultModel ?? null,
    thinkingLevels: data.thinkingLevels ?? {},
    thinkingLevelPins: data.thinkingLevelPins ?? {},
  };
}

async function readJson<T>(response: Response): Promise<T> {
  let data: T | { error?: unknown };
  try {
    data = await response.json() as T | { error?: unknown };
  } catch {
    throw new Error(`服务器返回了无法读取的响应（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    const payload = data as { error?: { code?: string; message?: string } | string };
    const errorBody = payload.error;
    const message = typeof errorBody === "object" && errorBody !== null && "message" in errorBody
      ? String(errorBody.message)
      : typeof errorBody === "string"
        ? errorBody
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}
