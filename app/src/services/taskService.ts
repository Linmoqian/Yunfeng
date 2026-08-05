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

export async function createTask(cwd: string, message: string): Promise<string> {
  const response = await fetch("/api/agent/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, type: "prompt", message }),
  });
  const data = await readJson<AgentResponse>(response);
  if (!data.sessionId) throw new Error("服务器没有返回新任务 ID");
  return data.sessionId;
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
