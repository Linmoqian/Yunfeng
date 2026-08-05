import {
  createTaskSummaries,
  type SessionSnapshot,
  type TaskSummary,
} from "../features/workbench/taskPresentation";

interface SessionsResponse {
  sessions: SessionSnapshot[];
  runningSessionIds?: string[];
}

interface AgentResponse {
  success?: boolean;
  sessionId?: string;
  error?: string;
  data?: {
    id?: string;
    provider?: string;
  };
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
}

export interface TaskSnapshot {
  sessions: SessionSnapshot[];
  runningSessionIds: string[];
  tasks: TaskSummary[];
}

export async function loadTaskSnapshot(signal?: AbortSignal): Promise<TaskSnapshot> {
  const response = await fetch("/api/sessions", { signal });
  const data = await readJson<SessionsResponse>(response);
  const runningSessionIds = data.runningSessionIds ?? [];

  return {
    sessions: data.sessions,
    runningSessionIds,
    tasks: createTaskSummaries(data.sessions, runningSessionIds),
  };
}

export function subscribeRunningSessions(
  onRunningSessions: (runningSessionIds: string[]) => void,
  onConnectionChange: (connected: boolean) => void,
): () => void {
  const source = new EventSource("/api/agent/running/events");
  source.onopen = () => onConnectionChange(true);
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as { type?: string; runningSessionIds?: string[] };
      if (payload.type === "running" && Array.isArray(payload.runningSessionIds)) {
        onRunningSessions(payload.runningSessionIds);
      }
    } catch {
      onConnectionChange(false);
    }
  };
  source.onerror = () => onConnectionChange(false);

  return () => source.close();
}

export async function sendTaskPrompt(sessionId: string, message: string): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "prompt", message }),
  });
  await readJson<AgentResponse>(response);
}

export async function createTask(
  cwd: string,
  message: string,
  model?: ModelSelection | null,
): Promise<string> {
  const response = await fetch("/api/agent/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cwd,
      type: "prompt",
      message,
      ...(model ? { provider: model.provider, modelId: model.modelId } : {}),
    }),
  });
  const data = await readJson<AgentResponse>(response);
  if (!data.sessionId) throw new Error("服务器没有返回新任务 ID");
  return data.sessionId;
}

export async function loadModelCatalog(cwd?: string, signal?: AbortSignal): Promise<ModelCatalog> {
  const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
  const response = await fetch(`/api/models${query}`, { signal });
  const data = await readJson<{
    modelList?: ModelOption[];
    defaultModel?: ModelSelection | null;
  }>(response);

  return {
    models: Array.isArray(data.modelList) ? data.modelList : [],
    defaultModel: data.defaultModel ?? null,
  };
}

export async function loadTaskModel(sessionId: string, signal?: AbortSignal): Promise<ModelSelection | null> {
  const stateResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/state`, { signal });
  const state = await readJson<{
    running?: boolean;
    state?: { model?: { provider?: string; id?: string } };
  }>(stateResponse);
  const liveModel = state.state?.model;
  if (state.running && liveModel?.provider && liveModel.id) {
    return { provider: liveModel.provider, modelId: liveModel.id };
  }

  const contextResponse = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/context`, { signal });
  const context = await readJson<{ context?: { model?: ModelSelection } }>(contextResponse);
  return context.context?.model ?? null;
}

export async function setTaskModel(sessionId: string, model: ModelSelection): Promise<ModelSelection> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "set_model", provider: model.provider, modelId: model.modelId }),
  });
  const data = await readJson<AgentResponse>(response);
  return {
    provider: data.data?.provider ?? model.provider,
    modelId: data.data?.id ?? model.modelId,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  let data: T | { error?: string };
  try {
    data = await response.json() as T | { error?: string };
  } catch {
    throw new Error(`服务器返回了无法读取的响应（HTTP ${response.status}）`);
  }

  const payload = data as Record<string, unknown>;
  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(error);
  }

  if (payload.success === false) {
    throw new Error(typeof payload.error === "string" ? payload.error : "任务操作失败");
  }

  return data as T;
}
