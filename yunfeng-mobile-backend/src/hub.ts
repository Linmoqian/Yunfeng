// WebSocket 服务：token 认证、心跳与远程桌面消息路由。
// Agent 会话桥接已移除；移动端对话/任务直接调用电脑侧 yunfeng-gateway。

import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Accounts } from "./accounts.ts";
import {
  DesktopSession,
  type CaptureOnce,
  type InputSender,
} from "./desktop.ts";
import type { ClientMessage, DesktopInput, ServerMessage } from "./types.ts";

export interface HubDeps {
  accounts: Accounts;
  captureOnce?: CaptureOnce;
  inputSender?: InputSender;
  defaultFps: number;
}

function parseToken(rawUrl: string | undefined, req: IncomingMessage): string {
  if (rawUrl) {
    const url = new URL(rawUrl, "http://localhost");
    const q = url.searchParams.get("token");
    if (q) return q;
  }
  const header = req.headers["x-device-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

class Connection {
  desktop: DesktopSession | null = null;
  private readonly socket: WebSocket;
  private readonly deps: HubDeps;

  constructor(socket: WebSocket, deps: HubDeps) {
    this.socket = socket;
    this.deps = deps;
  }

  send(msg: ServerMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  async handle(raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send({ type: "error", message: "invalid JSON" });
      return;
    }
    switch (msg.type) {
      case "ping":
        this.send({ type: "pong", id: msg.id });
        break;
      case "desktop.start":
        this.startDesktop(msg.id, msg.fps);
        break;
      case "desktop.stop":
        this.desktop?.stop("client");
        this.desktop = null;
        break;
      case "desktop.input":
        await this.handleInput(msg.id, msg.input);
        break;
      default:
        this.send({
          type: "error",
          message: `unknown message type: ${String((msg as { type: string }).type)}`,
        });
    }
  }

  private startDesktop(id: string, fps?: number): void {
    const capture = this.deps.captureOnce;
    if (!capture) {
      this.send({ type: "error", id, message: "screen capture unsupported on this platform" });
      return;
    }
    this.desktop?.stop("restart");
    const effectiveFps = fps ?? this.deps.defaultFps;
    const session = new DesktopSession({
      onFrame: (seq, frame) => {
        this.send({
          type: "desktop.frame",
          seq,
          mime: frame.mime,
          data: frame.data.toString("base64"),
        });
      },
      onStop: (reason) => {
        this.send({ type: "desktop.stopped", reason });
        this.desktop = null;
      },
    });
    this.desktop = session;
    session.start(effectiveFps, capture);
    this.send({ type: "rpc.response", id, ok: true, data: { running: true, fps: effectiveFps } });
  }

  private async handleInput(id: string | undefined, input: DesktopInput): Promise<void> {
    const sender = this.deps.inputSender;
    if (!sender) {
      this.send({ type: "error", id, message: "input unsupported on this platform" });
      return;
    }
    try {
      await sender(input);
      this.send({ type: "rpc.response", id, ok: true, data: { applied: true } });
    } catch (e) {
      this.send({ type: "error", id, message: errorMessage(e) });
    }
  }

  close(): void {
    this.desktop?.stop("disconnect");
    this.desktop = null;
  }
}

export class Hub {
  private readonly wss: WebSocketServer;
  private readonly deps: HubDeps;

  constructor(server: Server, path: string, deps: HubDeps) {
    this.deps = deps;
    this.wss = new WebSocketServer({ server, path });
    this.wss.on("connection", (socket, req) => this.onConnection(socket, req));
  }

  private onConnection(socket: WebSocket, req: IncomingMessage): void {
    const token = parseToken(req.url, req);
    const device = this.deps.accounts.auth(token);
    if (!device) {
      socket.send(JSON.stringify({ type: "error", message: "unauthorized" }), () => {
        socket.close(1008, "unauthorized");
      });
      return;
    }
    this.deps.accounts.touch(device.id);
    const conn = new Connection(socket, this.deps);
    socket.on("message", (data) => {
      void conn.handle(data.toString());
    });
    socket.on("close", () => conn.close());
    socket.on("error", () => conn.close());
  }

  close(): void {
    this.wss.close();
  }
}
