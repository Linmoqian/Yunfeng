// Yunfeng Server 入口：HTTP + SSE 服务（Node 单进程，进程内嵌 pi SDK）。
// 复刻 pi-web 的 API 面；仅监听 127.0.0.1。

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  handleAgentCommand,
  handleAgentEvents,
  handleAgentGet,
  handleAgentNew,
  handleCwdBrowse,
  handleCwdValidate,
  handleDefaultCwd,
  handleFilesGet,
  handleGitDiff,
  handleGitStatus,
  handleHome,
  handleModelsConfigGet,
  handleModelsConfigPut,
  handleModelsGet,
  handleProjectTrustGet,
  handleProjectTrustPost,
  handleRunningEvents,
  handleSessionContext,
  handleSessionDelete,
  handleSessionGet,
  handleSessionPatch,
  handleSessionsList,
  handleSessionState,
  handleSessionThinking,
  handleSkillsGet,
  json,
  jsonError,
  type RouteResult,
} from "./routes.js";
import { destroyAllSessions } from "./rpc-manager.js";
import {
  handleTaskCommands,
  handleTaskConversation,
  handleTaskCreate,
  handleTaskEvents,
  handleTaskEventsGlobal,
  handleTaskGet,
  handleTaskImport,
  handleTaskPatch,
  handleTasksGet,
} from "./task/task-routes.js";
import { getTaskContext } from "./task/task-context.js";

interface CliArgs {
  port: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 8000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--port") args.port = Number(argv[++i] ?? 8000);
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

/** 记录活动 SSE 连接，进程退出/重启时关闭。 */
const activeSse = new Set<() => void>();

function sendResult(res: ServerResponse, result: RouteResult): void {
  res.writeHead(result.status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...(result.headers ?? {}),
  });
  if (result.stream) {
    let closed = false;
    let streamCleanup: (() => void) | undefined;
    const write = (chunk: string): void => {
      if (!closed && !res.writableEnded) res.write(chunk);
    };
    const finish = (): void => {
      if (closed) return;
      closed = true;
      try { streamCleanup?.(); } catch { /* ignore */ }
      try { res.end(); } catch { /* ignore */ }
      activeSse.delete(finish);
    };
    activeSse.add(finish);
    res.on("close", finish);
    const returned = result.stream(write, finish);
    if (typeof returned === "function") streamCleanup = returned;
    return;
  }
  res.end(JSON.stringify(result.body ?? null));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const query = url.searchParams;

  // 兼容 pi-web 的 /api 前缀
  const route = path.startsWith("/api/") ? path.slice(4) : path;

  try {
    // 健康检查
    if (method === "GET" && route === "/health") {
      return sendResult(res, json({ ok: true, service: "yunfeng-server", version: "0.1.0" }));
    }

    // Agent RPC
    if (method === "POST" && route === "/agent/new") {
      return sendResult(res, await handleAgentNew(await readJsonBody(req)));
    }
    const agentCommandMatch = route.match(/^\/agent\/([^/]+)$/);
    if (agentCommandMatch && method === "POST") {
      return sendResult(res, await handleAgentCommand(decodeURIComponent(agentCommandMatch[1]), await readJsonBody(req)));
    }
    if (agentCommandMatch && method === "GET") {
      return sendResult(res, await handleAgentGet(decodeURIComponent(agentCommandMatch[1])));
    }
    const agentEventsMatch = route.match(/^\/agent\/([^/]+)\/events$/);
    if (agentEventsMatch && method === "GET") {
      return sendResult(res, await handleAgentEvents(decodeURIComponent(agentEventsMatch[1])));
    }
    if (method === "GET" && route === "/agent/running") {
      return sendResult(res, json({ runningSessionIds: (await import("./rpc-manager.js")).getRunningRpcSessionIds() }));
    }
    if (method === "GET" && route === "/agent/running/events") {
      return sendResult(res, handleRunningEvents());
    }

    // 任务领域 API（阶段 0+）: /api/tasks/...
    if (method === "GET" && route === "/tasks") {
      return sendResult(res, await handleTasksGet(query));
    }
    if (method === "POST" && route === "/tasks") {
      return sendResult(res, await handleTaskCreate(await readJsonBody(req)));
    }
    if (method === "POST" && route === "/tasks/import-session") {
      return sendResult(res, await handleTaskImport(await readJsonBody(req)));
    }
    if (method === "GET" && route === "/tasks/events") {
      return sendResult(res, handleTaskEventsGlobal());
    }
    const taskEventsMatch = route.match(/^\/tasks\/([^/]+)\/events$/);
    if (taskEventsMatch && method === "GET") {
      return sendResult(res, handleTaskEvents(decodeURIComponent(taskEventsMatch[1]), query));
    }
    const taskConversationMatch = route.match(/^\/tasks\/([^/]+)\/conversation$/);
    if (taskConversationMatch && method === "GET") {
      return sendResult(res, await handleTaskConversation(decodeURIComponent(taskConversationMatch[1]), query));
    }
    const taskCommandsMatch = route.match(/^\/tasks\/([^/]+)\/commands$/);
    if (taskCommandsMatch && method === "POST") {
      return sendResult(res, await handleTaskCommands(decodeURIComponent(taskCommandsMatch[1]), await readJsonBody(req)));
    }
    const taskPatchMatch = route.match(/^\/tasks\/([^/]+)$/);
    if (taskPatchMatch && method === "PATCH") {
      return sendResult(res, await handleTaskPatch(decodeURIComponent(taskPatchMatch[1]), await readJsonBody(req)));
    }
    if (taskPatchMatch && method === "GET") {
      return sendResult(res, await handleTaskGet(decodeURIComponent(taskPatchMatch[1])));
    }

    // Sessions
    if (method === "GET" && route === "/sessions") {
      return sendResult(res, await handleSessionsList());
    }
    const sessionMatch = route.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const id = decodeURIComponent(sessionMatch[1]);
      if (method === "GET") return sendResult(res, await handleSessionGet(id, query));
      if (method === "PATCH") return sendResult(res, await handleSessionPatch(id, await readJsonBody(req)));
      if (method === "DELETE") return sendResult(res, await handleSessionDelete(id));
    }
    const sessionCtxMatch = route.match(/^\/sessions\/([^/]+)\/context$/);
    if (sessionCtxMatch && method === "GET") {
      return sendResult(res, await handleSessionContext(decodeURIComponent(sessionCtxMatch[1]), query));
    }
    const sessionStateMatch = route.match(/^\/sessions\/([^/]+)\/state$/);
    if (sessionStateMatch && method === "GET") {
      return sendResult(res, await handleSessionState(decodeURIComponent(sessionStateMatch[1])));
    }
    const sessionThinkingMatch = route.match(/^\/sessions\/([^/]+)\/entries\/([^/]+)\/thinking$/);
    if (sessionThinkingMatch && method === "GET") {
      return sendResult(res, await handleSessionThinking(
        decodeURIComponent(sessionThinkingMatch[1]),
        decodeURIComponent(sessionThinkingMatch[2]),
        query,
      ));
    }

    // Models
    if (method === "GET" && route === "/models") {
      return sendResult(res, await handleModelsGet(query));
    }
    if (method === "GET" && route === "/models-config") {
      return sendResult(res, handleModelsConfigGet());
    }
    if (method === "PUT" && route === "/models-config") {
      return sendResult(res, handleModelsConfigPut(await readJsonBody(req)));
    }

    // Files: /files/[...path]
    if (route.startsWith("/files/") && method === "GET") {
      const segments = route.slice("/files/".length).split("/").filter(Boolean).map(decodeURIComponent);
      return sendResult(res, await handleFilesGet(segments, query));
    }

    // Git
    if (method === "GET" && route === "/git/status") {
      return sendResult(res, await handleGitStatus(query));
    }
    if (method === "GET" && route === "/git/diff") {
      return sendResult(res, await handleGitDiff(query));
    }

    // CWD / Home
    if (method === "GET" && route === "/cwd/browse") {
      return sendResult(res, await handleCwdBrowse(query));
    }
    if (method === "POST" && route === "/cwd/validate") {
      return sendResult(res, handleCwdValidate(await readJsonBody(req)));
    }
    if (method === "POST" && route === "/default-cwd") {
      return sendResult(res, handleDefaultCwd());
    }
    if (method === "GET" && route === "/home") {
      return sendResult(res, handleHome());
    }

    // Project trust
    if (method === "GET" && route === "/project-trust") {
      return sendResult(res, handleProjectTrustGet(query));
    }
    if (method === "POST" && route === "/project-trust") {
      return sendResult(res, handleProjectTrustPost(await readJsonBody(req)));
    }

    // Skills
    if (method === "GET" && route === "/skills") {
      return sendResult(res, await handleSkillsGet(query));
    }

    return sendResult(res, jsonError("Not found", 404));
  } catch (e) {
    return sendResult(res, jsonError(e instanceof Error ? e.message : String(e), 500));
  }
});

const args = parseArgs(process.argv.slice(2));

server.listen(args.port, "127.0.0.1", () => {
  console.log(`[server] listening on http://127.0.0.1:${args.port}`);
  console.log(`PI_SERVER_READY ${args.port}`);
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
