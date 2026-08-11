// rpc 会话桥接：把 WS 的 rpc.* 消息映射到 sidecar HTTP/SSE，并把会话事件转发回客户端。

import type { AgentEvent, RpcStartPayload } from "./types.ts";
import type { SidecarClient } from "./sidecar.ts";

type Send = (msg: unknown) => void;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class RpcRelay {
  private readonly subscriptions = new Map<string, () => void>();
  private readonly sidecar: SidecarClient;
  private readonly send: Send;

  constructor(sidecar: SidecarClient, send: Send) {
    this.sidecar = sidecar;
    this.send = send;
  }

  async start(id: string, payload: RpcStartPayload): Promise<void> {
    if (!this.sidecar.configured) {
      this.send({ type: "rpc.response", id, ok: false, error: "sidecar not configured" });
      return;
    }
    try {
      const data = await this.sidecar.startSession(payload);
      this.subscribe(data.sessionId);
      this.send({ type: "rpc.response", id, ok: true, data });
    } catch (e) {
      this.send({ type: "rpc.response", id, ok: false, error: messageOf(e) });
    }
  }

  async command(id: string, sessionId: string, command: Record<string, unknown>): Promise<void> {
    if (!this.sidecar.configured) {
      this.send({ type: "rpc.response", id, ok: false, error: "sidecar not configured" });
      return;
    }
    try {
      const data = await this.sidecar.sendCommand(sessionId, command);
      this.send({ type: "rpc.response", id, ok: true, data });
    } catch (e) {
      this.send({ type: "rpc.response", id, ok: false, error: messageOf(e) });
    }
  }

  async destroy(id: string, sessionId: string): Promise<void> {
    if (!this.sidecar.configured) {
      this.send({ type: "rpc.response", id, ok: false, error: "sidecar not configured" });
      return;
    }
    try {
      await this.sidecar.destroySession(sessionId);
      this.unsubscribe(sessionId);
      this.send({ type: "rpc.response", id, ok: true, data: { success: true } });
    } catch (e) {
      this.send({ type: "rpc.response", id, ok: false, error: messageOf(e) });
    }
  }

  private subscribe(sessionId: string): void {
    if (this.subscriptions.has(sessionId)) return;
    const unsubscribe = this.sidecar.subscribeEvents(sessionId, (event: AgentEvent) => {
      this.send({ type: "rpc.event", sessionId, event });
    });
    this.subscriptions.set(sessionId, unsubscribe);
  }

  private unsubscribe(sessionId: string): void {
    this.subscriptions.get(sessionId)?.();
    this.subscriptions.delete(sessionId);
  }

  close(): void {
    for (const sessionId of [...this.subscriptions.keys()]) {
      this.unsubscribe(sessionId);
    }
  }
}
