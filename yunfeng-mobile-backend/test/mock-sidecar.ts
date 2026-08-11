// sidecar 协议模拟服务：供 sidecar/hub 集成测试使用（无需真实 pi SDK）。

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export class MockSidecar {
  readonly server: Server;
  baseUrl = "";
  port = 0;
  started: Array<Record<string, unknown>> = [];
  commands: Array<{ sessionId: string; command: Record<string, unknown> }> = [];
  destroyed: string[] = [];
  private readonly sse = new Map<string, ServerResponse>();
  private readonly token: string;

  private constructor(token: string) {
    this.token = token;
    this.server = createServer((req, res) => this.handle(req, res));
  }

  static async start(token = "test-token"): Promise<MockSidecar> {
    const mock = new MockSidecar(token);
    await new Promise<void>((resolve) => mock.server.listen(0, "127.0.0.1", resolve));
    mock.port = (mock.server.address() as { port: number }).port;
    mock.baseUrl = `http://127.0.0.1:${mock.port}`;
    return mock;
  }

  pushEvent(sessionId: string, event: unknown): void {
    const res = this.sse.get(sessionId);
    if (res) res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      for (const res of this.sse.values()) res.end();
      this.server.close(() => resolve());
    });
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.headers["x-pi-token"] !== this.token) {
      this.json(res, 401, { error: "unauthorized" });
      return;
    }
    if (req.method === "GET" && path === "/api/health") {
      this.json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && path === "/api/sessions") {
      this.json(res, 200, { sessions: [] });
      return;
    }
    if (req.method === "GET" && path === "/api/models") {
      this.json(res, 200, {
        providers: [],
        available: [],
        enabled: [],
        defaultProvider: undefined,
        defaultModel: undefined,
      });
      return;
    }
    if (req.method === "POST" && path === "/api/rpc/start") {
      void this.readBody(req).then((body) => {
        this.started.push(body);
        this.json(res, 200, {
          sessionId: "s1",
          sessionFile: "/tmp/f.jsonl",
          cwd: String(body.cwd ?? ""),
        });
      });
      return;
    }
    const events = path.match(/^\/api\/rpc\/([^/]+)\/events$/);
    if (req.method === "GET" && events) {
      const id = decodeURIComponent(events[1]);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "connected", sessionId: id })}\n\n`);
      this.sse.set(id, res);
      req.on("close", () => this.sse.delete(id));
      return;
    }
    const command = path.match(/^\/api\/rpc\/([^/]+)\/command$/);
    if (req.method === "POST" && command) {
      const sessionId = decodeURIComponent(command[1]);
      void this.readBody(req).then((body) => {
        this.commands.push({ sessionId, command: body });
        this.json(res, 200, { success: true, data: { echo: body } });
      });
      return;
    }
    const destroy = path.match(/^\/api\/rpc\/([^/]+)\/destroy$/);
    if (req.method === "POST" && destroy) {
      this.destroyed.push(decodeURIComponent(destroy[1]));
      this.json(res, 200, { success: true });
      return;
    }
    this.json(res, 404, { error: "not found" });
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          resolve(body.length > 0 ? (JSON.parse(body) as Record<string, unknown>) : {});
        } catch {
          reject(new Error("invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}
