// 网关集成测试：使用 mock 上游验证认证、路径白名单、REST 转发、
// SSE 事件透传、上游故障与关键日志。

import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";
import { createGateway, type Gateway } from "../src/gateway.ts";
import { createLogger, type Logger } from "../src/logger.ts";

interface UpstreamFixture {
  server: Server;
  port: number;
  seenPaths: string[];
  lastEventId: string | undefined;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  return address.port;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function startUpstream(): Promise<UpstreamFixture> {
  const seenPaths: string[] = [];
  let lastEventId: string | undefined;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://upstream.local");
    seenPaths.push(url.pathname + url.search);
    lastEventId = req.headers["last-event-id"];

    if (url.pathname === "/health") return json(res, 200, { ok: true });

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      return json(res, 200, {
        tasks: [{ id: "task-1", sessionId: "s1", title: "网关联调任务", status: "waiting_input" }],
      });
    }

    if (req.method === "POST" && url.pathname === "/api/tasks/task-1/commands") {
      const body = await readBody(req);
      return json(res, 200, { ok: true, result: { echo: body, forwardedFor: req.headers["x-forwarded-for"] } });
    }

    if (req.method === "GET" && url.pathname === "/api/tasks/task-1/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write('data: {"type":"agent_start","sessionId":"s1"}\n\n');
      res.write('data: {"type":"message_delta","delta":"你"}\n\n');
      res.write('data: {"type":"agent_end","sessionId":"s1"}\n\n');
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sessions") {
      return json(res, 200, { sessions: [{ id: "s1", name: "历史对话" }] });
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      return json(res, 200, { models: [] });
    }

    if (req.method === "GET" && url.pathname === "/api/files/a") {
      return json(res, 200, { secret: true });
    }

    json(res, 404, { error: "not found" });
  });
  const port = await listen(server);
  return { server, port, seenPaths, get lastEventId() { return lastEventId; } };
}

interface GatewayFixture {
  gateway: Gateway;
  server: Server;
  port: number;
  logs: string[];
}

async function startGateway(
  upstreamPort: number,
  overrides: Partial<ReturnType<typeof loadConfig>> = {},
): Promise<GatewayFixture> {
  const logs: string[] = [];
  const logger: Logger = createLogger((line) => logs.push(line));
  const config = {
    ...loadConfig([], {}),
    host: "127.0.0.1",
    port: 0,
    upstream: `http://127.0.0.1:${upstreamPort}`,
    authToken: "test-token",
    ...overrides,
  };
  const gateway = createGateway(config, { logger });
  const server = createServer((req, res) => {
    void gateway.handle(req, res);
  });
  const port = await listen(server);
  return { gateway, server, port, logs };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("健康检查公开可访问，并报告上游状态", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  t.after(() => Promise.all([closeServer(upstream.server), closeServer(gateway.server)]));

  const response = await fetch(`http://127.0.0.1:${gateway.port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; upstream: { reachable: boolean } };
  assert.equal(body.ok, true);
  assert.equal(body.upstream.reachable, true);
});

test("缺少或错误 token 返回 401，正确 token 转发任务列表", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  t.after(() => Promise.all([closeServer(upstream.server), closeServer(gateway.server)]));

  const denied = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks`);
  assert.equal(denied.status, 401);

  const bad = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks?token=wrong`);
  assert.equal(bad.status, 401);

  const ok = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks?token=test-token`);
  assert.equal(ok.status, 200);
  const body = await ok.json() as { tasks: Array<{ id: string }> };
  assert.equal(body.tasks[0].id, "task-1");

  // 认证 query 不能泄漏到上游。
  assert.deepEqual(upstream.seenPaths.filter((p) => p.startsWith("/api/tasks")), ["/api/tasks"]);
  assert.ok(gateway.logs.some((line) => line.includes("[请求]") && line.includes("/api/tasks") && line.includes("status=200")));
  assert.ok(gateway.logs.some((line) => line.includes("[拒绝]") && line.includes("reason=unauthorized")));
});

test("POST 命令体原样转发并保留 Content-Type", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  t.after(() => Promise.all([closeServer(upstream.server), closeServer(gateway.server)]));

  const command = { type: "prompt", message: "你好，Agent" };
  const response = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks/task-1/commands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify(command),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { ok: boolean; result: { echo: typeof command } };
  assert.deepEqual(body.result.echo, command);
});

test("SSE 事件流透传并输出连接/事件/关闭日志", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  t.after(() => Promise.all([closeServer(upstream.server), closeServer(gateway.server)]));

  const response = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks/task-1/events`, {
    headers: { "X-Yunfeng-Token": "test-token", "Last-Event-ID": "7" },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const text = await response.text();
  assert.match(text, /"type":"agent_start"/);
  assert.match(text, /"type":"message_delta"/);
  assert.match(text, /"type":"agent_end"/);
  assert.equal(upstream.lastEventId, "7");

  assert.ok(gateway.logs.some((line) => line.includes("[SSE] 连接")));
  assert.ok(gateway.logs.some((line) => line.includes("[SSE] 事件") && line.includes("type=agent_start")));
  assert.ok(gateway.logs.some((line) => line.includes("[SSE] 关闭") && line.includes("events=3") && line.includes("key_events=2")));
});

test("默认白名单拒绝 /api/files，--allow-all 开放全部 /api", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  const openGateway = await startGateway(upstream.port, { allowAll: true });
  t.after(() => Promise.all([
    closeServer(upstream.server),
    closeServer(gateway.server),
    closeServer(openGateway.server),
  ]));

  const blocked = await fetch(`http://127.0.0.1:${gateway.port}/api/files/a`, {
    headers: { Authorization: "Bearer test-token" },
  });
  assert.equal(blocked.status, 404);
  assert.ok(gateway.logs.some((line) => line.includes("reason=path_not_allowed")));

  const allowed = await fetch(`http://127.0.0.1:${openGateway.port}/api/files/a`, {
    headers: { Authorization: "Bearer test-token" },
  });
  assert.equal(allowed.status, 200);
});

test("OPTIONS 预检免认证并返回 CORS 头", async (t) => {
  const upstream = await startUpstream();
  const gateway = await startGateway(upstream.port);
  t.after(() => Promise.all([closeServer(upstream.server), closeServer(gateway.server)]));

  const response = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks`, { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /Authorization/);
});

test("上游不可达返回结构化 502 并输出错误日志", async (t) => {
  // 先取一个空闲端口再关闭，构造确定不可达的上游。
  const probe = createServer(() => {});
  const port = await listen(probe);
  await closeServer(probe);

  const gateway = await startGateway(port);
  t.after(() => closeServer(gateway.server));

  const response = await fetch(`http://127.0.0.1:${gateway.port}/api/tasks`, {
    headers: { Authorization: "Bearer test-token" },
  });
  assert.equal(response.status, 502);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, "upstream_unreachable");
  assert.ok(gateway.logs.some((line) => line.includes("[代理] 上游不可达")));
});
