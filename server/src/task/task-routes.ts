// 任务领域 API 路由：/api/tasks/... 系列。
// 保留 /api/agent 与 /api/sessions 供兼容使用，本模块为 Agent 工作台的真实状态来源。

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { getTaskContext } from "./task-context.js";
import {
  apiError,
  toApiErrorBody,
  type TaskCommand,
  type TaskState,
} from "./types.js";
import { CommandRejectedError, isTaskCommand, TaskNotFoundError } from "./task-runtime.js";
import { getRpcSession, startRpcSession } from "../rpc-manager.js";
import { readSessionHeader, resolveSessionPath } from "../session-reader.js";
import type { RouteResult } from "../routes.js";
import { json } from "../routes.js";

function jsonApi(result: RouteResult, fallbackError: unknown): RouteResult {
  if (result.status < 400) return result;
  return {
    status: result.status,
    headers: { "Content-Type": "application/json" },
    body: toApiErrorBody(
      isRecord(result.body) && isRecord(result.body.error) && typeof result.body.error.code === "string"
        ? (result.body.error as never)
        : apiError("internal_error", fallbackError instanceof Error ? fallbackError.message : "服务器内部错误"),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeTask(state: TaskState) {
  return { ...state };
}

function ensureSessionForTask(sessionId: string): Promise<void> {
  // 已激活的会话直接用；否则按 pi session 路径再打开一个运行时包装器。
  if (getRpcSession(sessionId)?.isAlive()) return Promise.resolve();
  return resolveSessionPath(sessionId).then((filePath) => {
    if (!filePath) throw new TaskNotFoundError("会话不存在");
    const cwd = readSessionHeader(filePath)?.cwd ?? process.cwd();
    return startRpcSession(sessionId, filePath, cwd).then(() => undefined);
  });
}

// ----------------------------------------------------------------------------
// 处理函数
// ----------------------------------------------------------------------------

export async function handleTasksGet(query: URLSearchParams): Promise<RouteResult> {
  const { store } = getTaskContext();
  const search = (query.get("q") ?? "").trim().toLowerCase();
  const project = (query.get("project") ?? "").trim();
  const statusFilter = query.get("status") ?? "";
  const archivedFilter = query.get("archived");
  const cursor = query.get("cursor");
  const limit = Math.min(Math.max(Number(query.get("limit") ?? 100) || 100, 1), 500);

  let tasks = store.findAll();
  if (archivedFilter === "true") tasks = tasks.filter((t) => t.status === "archived");
  else if (archivedFilter === "false") tasks = tasks.filter((t) => t.status !== "archived");

  if (statusFilter) {
    const wanted = new Set(statusFilter.split(",").map((s) => s.trim()).filter(Boolean));
    if (wanted.size > 0) tasks = tasks.filter((t) => wanted.has(t.status));
  }
  if (project) tasks = tasks.filter((t) => t.cwd.endsWith(project) || t.cwd.includes(project));
  if (search) {
    const needle = search;
    tasks = tasks.filter((t) =>
      t.title.toLowerCase().includes(needle) ||
      t.currentAction.toLowerCase().includes(needle) ||
      t.cwd.toLowerCase().includes(needle),
    );
  }

  tasks.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  if (cursor) {
    const cursorIndex = tasks.findIndex((t) => t.id === cursor);
    if (cursorIndex >= 0) tasks = tasks.slice(cursorIndex + 1);
  }

  const items = tasks.slice(0, limit);
  const nextCursor = tasks.length > limit ? items[items.length - 1].id : undefined;
  return json({
    tasks: items.map(serializeTask),
    ...(nextCursor ? { nextCursor } : {}),
    total: store.findAll().length,
  });
}

export async function handleTaskCreate(body: Record<string, unknown>): Promise<RouteResult> {
  const { store, runtime, hub } = getTaskContext();
  const cwd = typeof body.cwd === "string" ? body.cwd : "";
  const message = typeof body.message === "string" ? body.message : "";
  if (!cwd) return jsonApi(json({ error: apiError("bad_request", "cwd 是必填项", { status: 400 }) }), null);
  if (!existsSync(cwd)) return jsonApi(json({ error: apiError("bad_request", `目录不存在: ${cwd}`, { status: 400 }) }), null);
  if (!message.trim()) return jsonApi(json({ error: apiError("bad_request", "message 不能为空", { status: 400 }) }), null);

  let provider: string | undefined;
  let modelId: string | undefined;
  let model: { provider: string; modelId: string } | undefined;
  if (typeof body.model === "object" && body.model !== null) {
    const m = body.model as { provider?: string; modelId?: string };
    if (typeof m.provider === "string" && typeof m.modelId === "string") {
      provider = m.provider;
      modelId = m.modelId;
      model = { provider, modelId };
    }
  }

  try {
    const tempKey = `__task_new__${randomUUID()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", cwd, {
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
    });
    const state = store.create({ sessionId: realSessionId, cwd, title: message.slice(0, 60), source: "task" });
    runtime.importSession(session);
    await hub.emit(state.id, "task_updated", { status: state.status, created: true });
    // 首轮 prompt
    await runtime.dispatchCommand(state, { type: "prompt", message });
    return json({ task: serializeTask(state), sessionId: realSessionId });
  } catch (error) {
    return jsonApi(json({ error: apiError("task_create_failed", error instanceof Error ? error.message : String(error)) }), error);
  }
}

export async function handleTaskImport(body: Record<string, unknown>): Promise<RouteResult> {
  const { store, runtime, hub } = getTaskContext();
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return jsonApi(json({ error: apiError("bad_request", "sessionId 是必填项", { status: 400 }) }), null);

  try {
    await ensureSessionForTask(sessionId);
    const wrapper = getRpcSession(sessionId);
    if (!wrapper) return jsonApi(json({ error: apiError("session_not_found", "会话不存在", { status: 404 }) }), null);
    const state = runtime.importSession(wrapper);
    await hub.emit(state.id, "task_updated", { imported: true });
    return json({ task: serializeTask(state), sessionId });
  } catch (error) {
    return jsonApi(json({ error: apiError("import_failed", error instanceof Error ? error.message : String(error)) }), error);
  }
}

export async function handleTaskGet(id: string): Promise<RouteResult> {
  const { store } = getTaskContext();
  const state = store.get(id);
  if (!state) return jsonApi(json({ error: apiError("task_not_found", "任务不存在", { status: 404 }) }), null);
  return json({ task: serializeTask(state) });
}

export async function handleTaskPatch(id: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { store, hub } = getTaskContext();
  const state = store.get(id);
  if (!state) return jsonApi(json({ error: apiError("task_not_found", "任务不存在", { status: 404 }) }), null);

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined) {
    if (!name) return jsonApi(json({ error: apiError("bad_request", "name 不能为空", { status: 400 }) }), null);
    store.update(id, (s) => { s.title = name; });
    await hub.emit(id, "task_updated", { title: name });
  }
  return json({ task: serializeTask(store.get(id)!) });
}

export async function handleTaskConversation(id: string, query: URLSearchParams): Promise<RouteResult> {
  const { store } = getTaskContext();
  const state = store.get(id);
  if (!state) return jsonApi(json({ error: apiError("task_not_found", "任务不存在", { status: 404 }) }), null);

  try {
    await ensureSessionForTask(state.sessionId);
  } catch (error) {
    return jsonApi(json({ error: apiError("session_not_found", error instanceof Error ? error.message : String(error), { status: 404 }) }), error);
  }
  // 会话正文仍由 pi session JSONL 保存，这里委托现有会话上下文读取。
  const { handleSessionContext } = await import("../routes.js");
  return handleSessionContext(state.sessionId, query);
}

export async function handleTaskCommands(id: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { store, runtime, hub } = getTaskContext();
  const state = store.get(id);
  if (!state) return jsonApi(json({ error: apiError("task_not_found", "任务不存在", { status: 404 }) }), null);

  const command = body as TaskCommand;
  if (!isTaskCommand(command)) {
    return jsonApi(json({ error: apiError("bad_request", "未知或非法的领域命令", { status: 400 }) }), null);
  }

  try {
    await ensureSessionForTask(state.sessionId);
    const result = await runtime.dispatchCommand(state, command);
    await hub.emit(id, "task_updated", { status: state.status, phase: state.phase });
    return json({ ok: true, result });
  } catch (error) {
    if (error instanceof TaskNotFoundError || error instanceof CommandRejectedError) {
      return jsonApi(json({ error: apiError(error instanceof CommandRejectedError ? error.code : "task_not_found", error.message, { status: error instanceof CommandRejectedError ? 409 : 404, retryable: false }) }), error);
    }
    return jsonApi(json({ error: apiError("command_failed", error instanceof Error ? error.message : String(error)) }), error);
  }
}

/** 工作台任务摘要事件流（所有任务状态事件）。 */
export function handleTaskEventsGlobal(): RouteResult {
  const { hub, store } = getTaskContext();
  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    stream: (write, close) => {
      const cleanup = hub.subscribeGlobalSse(write, close);
      // 首帧推送当前任务快照
      write(`data: ${JSON.stringify({ type: "task_snapshot", tasks: store.findAll().map(serializeTask), seq: 0 })}\n\n`);
      const heartbeat = setInterval(() => write(":\n\n"), 30_000);
      return () => {
        cleanup();
        clearInterval(heartbeat);
        close();
      };
    },
  };
}

/** 任务详情事件流（支持 Last-Event-ID 补发）。 */
export function handleTaskEvents(id: string, query: URLSearchParams): RouteResult {
  const { hub, store } = getTaskContext();
  const state = store.get(id);
  if (!state) return {
    status: 404,
    headers: { "Content-Type": "application/json" },
    body: toApiErrorBody(apiError("task_not_found", "任务不存在", { status: 404 })),
  };

  const afterSeqRaw = query.get("afterSeq");
  const afterSeq = afterSeqRaw && /^\d+$/.test(afterSeqRaw) ? Number(afterSeqRaw) : 0;

  return {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
    stream: (write, close) => {
      const cleanup = hub.subscribeTaskSse(id, write, close, afterSeq);
      const heartbeat = setInterval(() => write(":\n\n"), 30_000);
      return () => {
        cleanup();
        clearInterval(heartbeat);
        close();
      };
    },
  };
}
