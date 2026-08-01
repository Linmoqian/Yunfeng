// B 方案 HTTP 入口：agent 交互走官方 RpcClient 子进程，其余路由直读 JSONL。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  getRpcSession,
  getRunningRpcSessionIds,
  startRpcSession,
  destroyAllSessions,
} from "./rpc-session.js";
import { executeCommand } from "./commands.js";
import {
  buildSessionContext,
  getSessionEntries,
  invalidateSessionListCache,
  listAllSessions,
  readSessionHeader,
  resolveSessionPath,
} from "./session-reader.js";
import { SessionManager } from "@earendil-works/pi-coding-agent";

interface CliArgs {
  port: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 8001 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i] ?? 8001);
  }
  return args;
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, data: unknown, status = 200, headers?: Record<string, string>): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...(headers ?? {}) });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

const activeSse = new Set<() => void>();

function sendSse(res: ServerResponse, stream: (write: (chunk: string) => void) => void): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  let closed = false;
  const write = (chunk: string): void => {
    if (!closed && !res.writableEnded) res.write(chunk);
  };
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    try { res.end(); } catch { /* ignore */ }
    activeSse.delete(cleanup);
  };
  activeSse.add(cleanup);
  res.on("close", cleanup);
  stream(write);
}

// ============================================================================
// 路由
// ============================================================================

async function handleAgentNew(body: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
  const { cwd, ...command } = body;
  if (!cwd || typeof cwd !== "string") return { status: 400, data: { error: "cwd is required" } };
  if (!existsSync(cwd)) return { status: 400, data: { error: `Directory does not exist: ${cwd}` } };

  const { provider, modelId, thinkingLevel, ...promptCommand } = command as {
    provider?: string;
    modelId?: string;
    thinkingLevel?: string;
    [key: string]: unknown;
  };
  if ((provider && !modelId) || (!provider && modelId)) {
    return { status: 400, data: { error: "provider and modelId must be provided together" } };
  }

  // 新会话：spawn pi 子进程，用临时 key 防并发合并。
  const tempKey = `__new__${randomUUID()}`;
  try {
    const handle = await startRpcSession(tempKey, "", cwd, {
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
      ...(thinkingLevel ? { thinkingLevel } : {}),
    });

    // 从官方 get_state 读取真实 sessionId
    const stateResult = await executeCommand(handle, { type: "get_state" });
    if (!stateResult.success) throw new Error(stateResult.error);
    const state = stateResult.data as {
      sessionId?: string;
      model?: { provider: string; id: string };
      thinkingLevel?: string;
    };
    const realSessionId = state.sessionId ?? tempKey;

    // ensure_session：只创建运行时
    if (promptCommand.type === "ensure_session") {
      return {
        status: 200,
        data: {
          success: true,
          sessionId: realSessionId,
          data: null,
          model: state.model ? { provider: state.model.provider, modelId: state.model.id } : null,
          thinkingLevel: state.thinkingLevel,
        },
      };
    }

    const result = await executeCommand(handle, promptCommand);
    return {
      status: 200,
      data: {
        success: result.success,
        sessionId: realSessionId,
        data: result.success ? result.data : null,
        error: result.success ? undefined : result.error,
        model: state.model ? { provider: state.model.provider, modelId: state.model.id } : null,
        thinkingLevel: state.thinkingLevel,
      },
    };
  } catch (e) {
    return { status: 500, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function handleAgentCommand(id: string, body: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
  try {
    let handle = getRpcSession(id);
    if (!handle?.isAlive()) {
      // 打开已有会话：按 JSONL 路径 spawn
      const filePath = await resolveSessionPath(id);
      if (!filePath) return { status: 404, data: { error: "Session not found" } };
      const cwd = readSessionHeader(filePath)?.cwd ?? process.cwd();
      handle = await startRpcSession(id, filePath, cwd);
    }
    const result = await executeCommand(handle, body);
    return { status: 200, data: { success: result.success, data: result.data, error: result.error } };
  } catch (e) {
    return { status: 500, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function handleAgentGet(id: string): Promise<{ status: number; data: unknown }> {
  try {
    const handle = getRpcSession(id);
    if (!handle?.isAlive()) return { status: 200, data: { running: false } };
    const result = await executeCommand(handle, { type: "get_state" });
    return { status: 200, data: { running: true, state: result.data } };
  } catch (e) {
    return { status: 500, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function handleAgentEvents(id: string, res: ServerResponse): Promise<void> {
  const handle = getRpcSession(id);
  if (!handle?.isAlive()) {
    return sendError(res, "Session not running", 404);
  }
  sendSse(res, (write) => {
    write(`data: ${JSON.stringify({ type: "connected", sessionId: id })}\n\n`);
    const unsubscribe = handle.onEvent((event) => {
      write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => write(":\n\n"), 30_000);
    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

async function handleSessionsList(res: ServerResponse): Promise<void> {
  try {
    const sessions = await listAllSessions();
    sendJson(res, { sessions, runningSessionIds: getRunningRpcSessionIds() });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e), 500);
  }
}

async function handleSessionGet(id: string, res: ServerResponse): Promise<void> {
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return sendError(res, "Session not found", 404);
    const sm = SessionManager.open(filePath);
    const entries = sm.getEntries() as never;
    const leafId = sm.getLeafId();
    const context = buildSessionContext(entries, leafId);
    const header = sm.getHeader();
    const info = header ? {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? "",
      name: sm.getSessionName(),
      created: header.timestamp,
      modified: header.timestamp,
      messageCount: context.messages.length,
      firstMessage: context.messages.find((m) => m.role === "user") ? "(has messages)" : "(no messages)",
      parentSessionId: undefined,
    } : null;
    sendJson(res, { sessionId: id, filePath, info, leafId, context });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e), 500);
  }
}

async function handleSessionContext(id: string, res: ServerResponse): Promise<void> {
  try {
    const filePath = await resolveSessionPath(id);
    if (!filePath) return sendError(res, "Session not found", 404);
    const sm = SessionManager.open(filePath);
    const context = buildSessionContext(sm.getEntries() as never, sm.getLeafId());
    sendJson(res, { context });
  } catch (e) {
    sendError(res, e instanceof Error ? e.message : String(e), 500);
  }
}

// ============================================================================
// Server
// ============================================================================

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  const route = path.startsWith("/api/") ? path.slice(4) : path;

  try {
    if (method === "GET" && route === "/health") {
      return sendJson(res, { ok: true, service: "yunfeng-server-rpc", version: "0.1.0" });
    }

    // Agent RPC
    if (method === "POST" && route === "/agent/new") {
      const r = await handleAgentNew(await readJsonBody(req));
      return sendJson(res, r.data, r.status);
    }
    const agentCommandMatch = route.match(/^\/agent\/([^/]+)$/);
    if (agentCommandMatch && method === "POST") {
      const r = await handleAgentCommand(decodeURIComponent(agentCommandMatch[1]), await readJsonBody(req));
      return sendJson(res, r.data, r.status);
    }
    if (agentCommandMatch && method === "GET") {
      const r = await handleAgentGet(decodeURIComponent(agentCommandMatch[1]));
      return sendJson(res, r.data, r.status);
    }
    const agentEventsMatch = route.match(/^\/agent\/([^/]+)\/events$/);
    if (agentEventsMatch && method === "GET") {
      return await handleAgentEvents(decodeURIComponent(agentEventsMatch[1]), res);
    }
    if (method === "GET" && route === "/agent/running") {
      return sendJson(res, { runningSessionIds: getRunningRpcSessionIds() });
    }
    if (method === "GET" && route === "/agent/running/events") {
      return sendSse(res, (write) => {
        const send = (): void => {
          write(`data: ${JSON.stringify({ type: "running", runningSessionIds: getRunningRpcSessionIds() })}\n\n`);
        };
        send();
        const heartbeat = setInterval(() => write(":\n\n"), 30_000);
        res.on("close", () => clearInterval(heartbeat));
      });
    }

    // Sessions
    if (method === "GET" && route === "/sessions") {
      return await handleSessionsList(res);
    }
    const sessionMatch = route.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === "GET") {
      return await handleSessionGet(decodeURIComponent(sessionMatch[1]), res);
    }
    const sessionCtxMatch = route.match(/^\/sessions\/([^/]+)\/context$/);
    if (sessionCtxMatch && method === "GET") {
      return await handleSessionContext(decodeURIComponent(sessionCtxMatch[1]), res);
    }

    return sendError(res, "Not found", 404);
  } catch (e) {
    return sendError(res, e instanceof Error ? e.message : String(e), 500);
  }
});

const args = parseArgs(process.argv.slice(2));

server.listen(args.port, "127.0.0.1", () => {
  console.log(`[server-rpc] listening on http://127.0.0.1:${args.port}`);
  console.log(`PI_SERVER_RPC_READY ${args.port}`);
});

function shutdown(): void {
  for (const cleanup of activeSse) {
    try { cleanup(); } catch { /* ignore */ }
  }
  destroyAllSessions();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
