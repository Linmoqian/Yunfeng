// Sidecar 入口：HTTP + SSE 服务，仅监听 127.0.0.1，token 认证。
// 启动协议：stdout 输出一行 `PI_SIDECAR_READY <port> <token>`。

import { getModels } from "./models";
import { listAllSessions, readSessionContext } from "./sessions";
import { destroyAllSessions, getRpcSession, startRpcSession } from "./registry";
import { listDir, readFileText } from "./fs-api";
import { SettingsManager, getAgentDir } from "@earendil-works/pi-coding-agent";

interface CliArgs {
  port: number;
  token: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 0, token: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i] ?? 0);
    else if (a === "--token") args.token = argv[++i] ?? "";
  }
  if (!args.token) {
    console.error("PI_SIDECAR: --token is required");
    process.exit(1);
  }
  return args;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function handleRequest(
  req: Request,
  token: string,
  basePath: string,
): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith(basePath)) return error("Not found", 404);
  const path = url.pathname.slice(basePath.length) || "/";

  // token 校验
  const authToken = req.headers.get("x-pi-token") ?? url.searchParams.get("token") ?? "";
  if (authToken !== token) return error("Unauthorized", 401);

  const method = req.method;

  // GET /api/health
  if (method === "GET" && path === "/health") {
    return json({ ok: true, version: 1 });
  }

  // GET /api/sessions
  if (method === "GET" && path === "/sessions") {
    try {
      return json({ sessions: await listAllSessions() });
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // GET /api/sessions/:id/context
  const ctxMatch = path.match(/^\/sessions\/([^/]+)\/context$/);
  if (method === "GET" && ctxMatch) {
    const id = decodeURIComponent(ctxMatch[1]);
    const leafId = url.searchParams.get("leafId");
    try {
      const ctx = await readSessionContext(id, leafId);
      if (!ctx) return error("Session not found", 404);
      return json(ctx);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // GET /api/models
  if (method === "GET" && path === "/models") {
    try {
      const settings = SettingsManager.create(process.cwd(), getAgentDir());
      return json(await getModels(settings));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // POST /api/rpc/start
  if (method === "POST" && path === "/rpc/start") {
    const body = (await req.json()) as {
      sessionId?: string;
      sessionFile?: string;
      cwd: string;
      toolNames?: string[];
      initialModel?: { provider: string; modelId: string };
      thinkingLevel?: string;
    };
    if (!body.cwd) return error("cwd is required");
    try {
      const { session, realSessionId } = await startRpcSession(
        body.sessionId ?? "",
        body.sessionFile ?? "",
        body.cwd,
        {
          toolNames: body.toolNames,
          initialModel: body.initialModel,
          thinkingLevel: body.thinkingLevel,
        },
      );
      return json({ sessionId: realSessionId, sessionFile: session.sessionFile, cwd: session.cwd });
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // GET /api/rpc/:id/events (SSE)
  const eventsMatch = path.match(/^\/rpc\/([^/]+)\/events$/);
  if (method === "GET" && eventsMatch) {
    const id = decodeURIComponent(eventsMatch[1]);
    const session = getRpcSession(id);
    if (!session?.isAlive()) return error("Session not running", 404);

    let unsubscribe: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const encode = (data: unknown) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        encode({ type: "connected", sessionId: id });
        unsubscribe = session.onEvent((event) => encode(event));
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(":\n\n"));
          } catch {
            // closed
          }
        }, 30_000);
      },
      cancel() {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // POST /api/rpc/:id/command
  const commandMatch = path.match(/^\/rpc\/([^/]+)\/command$/);
  if (method === "POST" && commandMatch) {
    const id = decodeURIComponent(commandMatch[1]);
    const session = getRpcSession(id);
    if (!session?.isAlive()) return error("Session not running", 404);
    const body = (await req.json()) as Record<string, unknown>;
    try {
      const data = await session.send(body);
      return json({ success: true, data });
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // POST /api/rpc/:id/destroy
  const destroyMatch = path.match(/^\/rpc\/([^/]+)\/destroy$/);
  if (method === "POST" && destroyMatch) {
    const id = decodeURIComponent(destroyMatch[1]);
    getRpcSession(id)?.destroy();
    return json({ success: true });
  }

  // GET /api/fs/list
  if (method === "GET" && path === "/fs/list") {
    const root = url.searchParams.get("root");
    const p = url.searchParams.get("path") ?? "";
    if (!root) return error("root is required");
    try {
      return json({ entries: await listDir(root, p) });
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  // GET /api/fs/read
  if (method === "GET" && path === "/fs/read") {
    const root = url.searchParams.get("root");
    const p = url.searchParams.get("path") ?? "";
    if (!root) return error("root is required");
    try {
      return json(await readFileText(root, p));
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
    }
  }

  return error("Not found", 404);
}

const args = parseArgs(process.argv.slice(2));

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: args.port,
  fetch: (req) => handleRequest(req, args.token, "/api"),
});

process.on("SIGINT", () => {
  destroyAllSessions();
  process.exit(0);
});
process.on("SIGTERM", () => {
  destroyAllSessions();
  process.exit(0);
});

console.log(`PI_SIDECAR_READY ${server.port} ${args.token}`);
console.error("[sidecar] listening on 127.0.0.1:" + server.port);
