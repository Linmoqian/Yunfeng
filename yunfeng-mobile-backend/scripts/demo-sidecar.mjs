// 演示用 pi sidecar：模拟 HTTP/SSE 协议，对 prompt 指令回执一段事件流（message_update → message_complete）。
// 用于在无真实 pi SDK 环境下验证 移动端 → 后端 → sidecar → 后端 → 移动端 全链路。

import { createServer } from "node:http";

const PORT = Number(process.env.DEMO_PORT ?? 8600);
const TOKEN = process.env.DEMO_TOKEN ?? "demo-token";
const SESSION_ID = "demo-s1";

const sse = new Map();

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (req.headers["x-pi-token"] !== TOKEN) {
    json(res, 401, { error: "unauthorized" });
    return;
  }
  if (req.method === "GET" && path === "/api/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && path === "/api/sessions") {
    json(res, 200, { sessions: [] });
    return;
  }
  if (req.method === "GET" && path === "/api/models") {
    json(res, 200, {
      providers: [{ id: "demo", name: "演示", authMethods: [], configured: true }],
      available: [{ id: "demo", provider: "demo", name: "演示模型", supportsThinking: false }],
      enabled: ["demo"],
      defaultProvider: "demo",
      defaultModel: "demo",
    });
    return;
  }
  if (req.method === "POST" && path === "/api/rpc/start") {
    void readBody(req).then((body) => {
      json(res, 200, {
        sessionId: SESSION_ID,
        sessionFile: "/tmp/demo-s1.jsonl",
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
    sse.set(id, res);
    req.on("close", () => sse.delete(id));
    return;
  }
  const command = path.match(/^\/api\/rpc\/([^/]+)\/command$/);
  if (req.method === "POST" && command) {
    const sessionId = decodeURIComponent(command[1]);
    void readBody(req).then((body) => {
      const text =
        typeof body.text === "string" ? body.text : String(body.command?.text ?? "");
      setTimeout(() => {
        const out = sse.get(sessionId);
        if (out) {
          out.write(
            `data: ${JSON.stringify({ type: "message_update", text: "（演示回执）已收到指令：" })}\n\n`,
          );
          out.write(`data: ${JSON.stringify({ type: "message_update", text })}\n\n`);
          out.write(`data: ${JSON.stringify({ type: "message_complete" })}\n\n`);
        }
      }, 150);
      json(res, 200, { success: true, data: { ok: true } });
    });
    return;
  }
  const destroy = path.match(/^\/api\/rpc\/([^/]+)\/destroy$/);
  if (req.method === "POST" && destroy) {
    sse.delete(decodeURIComponent(destroy[1]));
    json(res, 200, { success: true });
    return;
  }
  json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`DEMO_SIDECAR_READY ${PORT}`);
});
