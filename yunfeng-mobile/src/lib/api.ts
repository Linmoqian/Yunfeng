// Sidecar HTTP 客户端：与 app/sidecar 的 REST + SSE API 通信。

import type {
  AgentEvent,
  FsEntry,
  ModelsResult,
  SessionContext,
  SessionInfo,
} from "./types";

export class SidecarClient {
  constructor(
    public readonly baseUrl: string,
    public readonly token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "X-Pi-Token": this.token,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      success?: boolean;
      data?: unknown;
      [key: string]: unknown;
    };
    if (!res.ok || body.error) {
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return (body.data as T) ?? (body as T);
  }

  getHealth(): Promise<{ ok: boolean }> {
    return this.request("/api/health");
  }

  listSessions(): Promise<{ sessions: SessionInfo[] }> {
    return this.request("/api/sessions");
  }

  getSessionContext(sessionId: string, leafId?: string): Promise<SessionContext> {
    const q = leafId ? `?leafId=${encodeURIComponent(leafId)}` : "";
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/context${q}`);
  }

  getModels(): Promise<ModelsResult> {
    return this.request("/api/models");
  }

  async startSession(opts: {
    sessionId?: string;
    sessionFile?: string;
    cwd: string;
    initialModel?: { provider: string; modelId: string };
  }): Promise<{ sessionId: string; sessionFile: string; cwd: string }> {
    return this.request("/api/rpc/start", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  sendCommand<T = unknown>(sessionId: string, command: Record<string, unknown>): Promise<T> {
    return this.request(`/api/rpc/${encodeURIComponent(sessionId)}/command`, {
      method: "POST",
      body: JSON.stringify(command),
    });
  }

  destroySession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/api/rpc/${encodeURIComponent(sessionId)}/destroy`, {
      method: "POST",
    });
  }

  listDir(root: string, path: string): Promise<{ entries: FsEntry[] }> {
    return this.request(
      `/api/fs/list?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
    );
  }

  readFile(root: string, path: string): Promise<{ content: string; truncated: boolean }> {
    return this.request(
      `/api/fs/read?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
    );
  }

  /**
   * 订阅会话事件流（SSE）。返回取消函数。
   * 事件内容与 pi 的 AgentSession 事件一致（message_update / tool_execution_* / agent_* 等）。
   */
  subscribeEvents(
    sessionId: string,
    onEvent: (event: AgentEvent) => void,
    onError?: (error: Error) => void,
  ): () => void {
    let controller = new AbortController();
    const url = `${this.baseUrl}/api/rpc/${encodeURIComponent(sessionId)}/events`;

    const connect = () => {
      fetch(url, {
        headers: { "X-Pi-Token": this.token },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`SSE HTTP ${res.status}`);
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
              for (const line of part.split("\n")) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (!payload) continue;
                try {
                  onEvent(JSON.parse(payload) as AgentEvent);
                } catch {
                  // 忽略坏事件
                }
              }
            }
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
    };

    connect();
    return () => controller.abort();
  }
}
