// 移动后端协议类型：只保留账号配对与远程桌面。
// Agent 任务/对话不再经过本服务，移动端直接调用电脑侧 yunfeng-gateway 的 /api 接口。

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

// ---- 远程桌面 ----
export type DesktopInput =
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number; button?: "left" | "right" }
  | { kind: "scroll"; x: number; y: number; dy: number }
  | { kind: "key"; keyCode: number; down: boolean };

// ---- WS 客户端 → 服务端 ----
export type ClientMessage =
  | { type: "ping"; id?: string }
  | { type: "desktop.start"; id: string; fps?: number }
  | { type: "desktop.stop"; id: string }
  | { type: "desktop.input"; id?: string; input: DesktopInput };

// ---- WS 服务端 → 客户端 ----
export type ServerMessage =
  | { type: "pong"; id?: string }
  | { type: "rpc.response"; id?: string; ok: true; data?: unknown }
  | { type: "rpc.response"; id?: string; ok: false; error: string }
  | { type: "desktop.frame"; seq: number; mime: string; data: string }
  | { type: "desktop.stopped"; reason?: string }
  | { type: "error"; id?: string; message: string };

// ---- 配置 ----
export interface Config {
  host: string;
  port: number;
  dbPath: string;
  fps: number;
  pairTtlMs: number;
}
