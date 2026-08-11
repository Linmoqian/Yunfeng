// 协议与共享类型。sidecar 相关类型与 yunfeng-mobile/src/lib/types.ts 及 app/sidecar/src/types.ts 保持镜像。

// ---- sidecar 协议镜像 ----
export interface SessionInfo {
  path: string;
  id: string;
  cwd: string | undefined;
  name: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId: string | undefined;
  projectRoot: string | undefined;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  supportsThinking: boolean;
}

export interface ModelsResult {
  providers: { id: string; name: string; authMethods: string[]; configured: boolean }[];
  available: ModelInfo[];
  enabled: string[];
  defaultProvider: string | undefined;
  defaultModel: string | undefined;
}

export interface SessionContext {
  messages: { role: string; content: unknown; timestamp?: string }[];
  entryIds: string[];
  thinkingLevel: string | undefined;
  model: { provider: string; modelId: string } | undefined;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
}

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

// ---- 账号 ----
export interface Device {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface PairingInfo {
  code: string;
  expiresAt: number;
}

// ---- WS 客户端 → 服务端 ----
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

// ---- WS 服务端 → 客户端 ----
export type ServerMessage =
  | { type: "pong"; id?: string }
  | { type: "rpc.response"; id?: string; ok: true; data?: unknown }
  | { type: "rpc.response"; id?: string; ok: false; error: string }
  | { type: "rpc.event"; sessionId: string; event: AgentEvent }
  | { type: "desktop.frame"; seq: number; mime: string; data: string }
  | { type: "desktop.stopped"; reason?: string }
  | { type: "error"; id?: string; message: string };

// ---- 配置 ----
export interface Config {
  host: string;
  port: number;
  dbPath: string;
  sidecarUrl: string;
  sidecarToken: string;
  fps: number;
  pairTtlMs: number;
}
