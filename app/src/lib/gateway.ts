// 网关 API 客户端：移动端只通过 yunfeng-gateway 访问电脑侧 Agent。
// REST 使用 Bearer token；SSE 因 EventSource 无法设置请求头，token 走 query。

import type {
  GatewayHealth,
  ModelsData,
  SessionMessage,
  TaskCommand,
  TaskIntervention,
  TaskListResponse,
  TaskState,
  TaskStreamEvent,
} from "./types";

export interface GatewaySettings {
  baseUrl: string;
  token: string;
}

const BASE_URL_KEY = "yf-gateway-base-url";
const TOKEN_KEY = "yf-gateway-token";

export function loadGatewaySettings(storage: Storage = localStorage): GatewaySettings {
  return {
    baseUrl: (storage.getItem(BASE_URL_KEY) ?? "").trim().replace(/\/+$/, ""),
    token: (storage.getItem(TOKEN_KEY) ?? "").trim(),
  };
}

export function saveGatewaySettings(settings: GatewaySettings, storage: Storage = localStorage): void {
  storage.setItem(BASE_URL_KEY, settings.baseUrl.trim().replace(/\/+$/, ""));
  storage.setItem(TOKEN_KEY, settings.token.trim());
}

export function isGatewayConfigured(settings: GatewaySettings): boolean {
  return settings.baseUrl.length > 0 && settings.token.length > 0;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof body.error === "string") return body.error;
    if (typeof body.error === "object" && body.error && typeof body.error.message === "string") {
      return body.error.message;
    }
    if (typeof body.message === "string") return body.message;
  } catch {
    // ignore malformed body
  }
  return `HTTP ${response.status}`;
}

export class GatewayClient {
  constructor(
    public readonly baseUrl: string,
    public readonly token: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    return (await response.json()) as T;
  }

  checkHealth(): Promise<GatewayHealth> {
    return fetch(`${this.baseUrl}/health`).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as GatewayHealth;
    });
  }

  loadTasks(query: { q?: string; status?: string; archived?: "true" | "false"; limit?: number } = {}): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    if (query.archived) params.set("archived", query.archived);
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return this.request<TaskListResponse>(`/api/tasks${qs ? `?${qs}` : ""}`);
  }

  /** 创建任务；未给消息时创建空白对话，首条消息可随后发送。 */
  createTask(message = ""): Promise<{ task: TaskState; sessionId: string }> {
    return this.request<{ task: TaskState; sessionId: string }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(message ? { message } : {}),
    });
  }

  async loadTaskConversation(taskId: string): Promise<SessionMessage[]> {
    const data = await this.request<{ context?: { messages?: SessionMessage[]; entryIds?: string[] } }>(
      `/api/tasks/${encodeURIComponent(taskId)}/conversation?deferMedia`,
    );
    const messages = Array.isArray(data.context?.messages) ? data.context.messages : [];
    const entryIds = Array.isArray(data.context?.entryIds) ? data.context.entryIds : [];
    return messages.map((message, index) => ({
      ...(message && typeof message === "object" ? message : { role: "assistant", content: message }),
      id: message.id ?? entryIds[index] ?? `message-${index}`,
    }));
  }

  sendTaskCommand(taskId: string, command: TaskCommand): Promise<unknown> {
    return this.request(`/api/tasks/${encodeURIComponent(taskId)}/commands`, {
      method: "POST",
      body: JSON.stringify(command),
    });
  }

  renameTask(taskId: string, name: string): Promise<TaskState> {
    return this.request<{ task: TaskState }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }).then((data) => data.task);
  }

  loadTaskInterventions(taskId: string): Promise<TaskIntervention[]> {
    return this.request<{ interventions: TaskIntervention[] }>(
      `/api/tasks/${encodeURIComponent(taskId)}/interventions`,
    ).then((data) => data.interventions ?? []);
  }

  resolveIntervention(
    taskId: string,
    requestId: string,
    decision: "approve" | "reject",
    value?: string,
  ): Promise<void> {
    return this.request(
      `/api/tasks/${encodeURIComponent(taskId)}/interventions/${encodeURIComponent(requestId)}`,
      {
        method: "POST",
        body: JSON.stringify({ decision, ...(value ? { value } : {}) }),
      },
    ).then(() => undefined);
  }

  loadModels(): Promise<ModelsData> {
    return this.request<ModelsData>("/api/models");
  }

  /**
   * 订阅任务事件流。返回取消函数。
   * EventSource 会自动按 Last-Event-ID 重连，断线事件通过 onConnectionChange(false) 通知。
   */
  subscribeTaskEvents(
    taskId: string,
    onEvent: (event: TaskStreamEvent) => void,
    onConnectionChange?: (connected: boolean) => void,
  ): () => void {
    const url = `${this.baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events?token=${encodeURIComponent(this.token)}`;
    const source = new EventSource(url);
    source.onopen = () => onConnectionChange?.(true);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as TaskStreamEvent);
      } catch {
        onConnectionChange?.(false);
      }
    };
    source.onerror = () => onConnectionChange?.(false);
    return () => source.close();
  }

  /** 订阅全局任务摘要事件流，用于任务列表轻量刷新。 */
  subscribeTaskSummary(
    onEvent: (event: TaskStreamEvent) => void,
    onConnectionChange?: (connected: boolean) => void,
  ): () => void {
    const url = `${this.baseUrl}/api/tasks/events?token=${encodeURIComponent(this.token)}`;
    const source = new EventSource(url);
    source.onopen = () => onConnectionChange?.(true);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data) as TaskStreamEvent);
      } catch {
        onConnectionChange?.(false);
      }
    };
    source.onerror = () => onConnectionChange?.(false);
    return () => source.close();
  }
}
