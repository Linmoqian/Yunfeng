// 移动后端客户端：配对（REST）+ 实时通道（WS）。协议镜像 yunfeng-mobile-backend/src/types.ts。

import type { AgentEvent } from "./types";

export interface RemoteDeviceInfo {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface RemoteConnection {
  baseUrl: string;
  token: string;
  deviceId: string;
}

export interface PairResult {
  deviceId: string;
  token: string;
}

export type RpcStartPayload = {
  cwd: string;
  sessionId?: string;
  sessionFile?: string;
  initialModel?: { provider: string; modelId: string };
  thinkingLevel?: string;
};

export type DesktopInput =
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number; button?: "left" | "right" }
  | { kind: "scroll"; x: number; y: number; dy: number }
  | { kind: "key"; keyCode: number; down: boolean };

export type ClientMessage =
  | { type: "ping"; id?: string }
  | { type: "rpc.start"; id: string; payload: RpcStartPayload }
  | { type: "rpc.command"; id: string; sessionId: string; command: Record<string, unknown> }
  | { type: "rpc.destroy"; id: string; sessionId: string }
  | { type: "desktop.start"; id: string; fps?: number }
  | { type: "desktop.stop"; id: string }
  | { type: "desktop.input"; id?: string; input: DesktopInput };

export type ServerMessage =
  | { type: "pong"; id?: string }
  | { type: "rpc.response"; id?: string; ok: true; data?: unknown }
  | { type: "rpc.response"; id?: string; ok: false; error: string }
  | { type: "rpc.event"; sessionId: string; event: AgentEvent }
  | { type: "desktop.frame"; seq: number; mime: string; data: string }
  | { type: "desktop.stopped"; reason?: string }
  | { type: "error"; id?: string; message: string };

const STORAGE_KEY = "yunfeng.remote.connection";

export function saveConnection(conn: RemoteConnection | null): void {
  if (conn) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadConnection(): RemoteConnection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RemoteConnection;
    return parsed.baseUrl && parsed.token && parsed.deviceId ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export class RemoteClient {
  private ws: WebSocket | null = null;

  constructor(public readonly conn: RemoteConnection) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  static async pair(baseUrl: string, code: string, name?: string): Promise<PairResult> {
    const res = await fetch(`${normalizeBase(baseUrl)}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    const body = (await res.json().catch(() => ({}))) as PairResult & { error?: string };
    if (!res.ok || body.error || !body.token) {
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return { deviceId: body.deviceId, token: body.token };
  }

  static async health(
    baseUrl: string,
  ): Promise<{ ok: boolean; pairing: { active: boolean; expiresIn: number } }> {
    const res = await fetch(`${normalizeBase(baseUrl)}/health`);
    return (await res.json().catch(() => ({}))) as {
      ok: boolean;
      pairing: { active: boolean; expiresIn: number };
    };
  }

  connect(onMessage: (msg: ServerMessage) => void): () => void {
    const ws = new WebSocket(
      `${normalizeBase(this.conn.baseUrl)}/ws?token=${encodeURIComponent(this.conn.token)}`,
    );
    this.ws = ws;
    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data as string) as ServerMessage);
      } catch {
        // 忽略坏帧
      }
    };
    return () => this.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
