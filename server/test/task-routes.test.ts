// 任务路由错误契约测试：验证 /api/tasks/* 的结构化错误返回真实 HTTP 状态码，
// 且公开错误体不泄漏内部 status 字段。使用临时数据目录，不接触真实 ~/.yunfeng。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTaskContextForDataDir } from "../src/task/task-context.js";
import {
  handleTaskCommands,
  handleTaskEvents,
  handleTaskGet,
  handleTaskPatch,
  handleTasksGet,
  resolveTaskAfterSeq,
} from "../src/task/task-routes.js";

type TaskContext = ReturnType<typeof createTaskContextForDataDir>;

async function withTaskContext(run: (ctx: TaskContext) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "yf-task-routes-test-"));
  const ctx = createTaskContextForDataDir(dir);
  const globalRef = globalThis as unknown as { __yfContext?: TaskContext };
  globalRef.__yfContext = ctx;
  try {
    await run(ctx);
  } finally {
    delete globalRef.__yfContext;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("handleTaskGet 不存在任务返回 404 结构化错误", async () => {
  await withTaskContext(async () => {
    const result = await handleTaskGet("missing-task");
    assert.equal(result.status, 404);
    const body = result.body as { error?: Record<string, unknown> };
    assert.equal(body.error?.code, "task_not_found");
    assert.equal("status" in (body.error ?? {}), false);
  });
});

test("handleTaskPatch 不存在任务返回 404", async () => {
  await withTaskContext(async () => {
    const result = await handleTaskPatch("missing-task", { name: "新标题" });
    assert.equal(result.status, 404);
  });
});

test("handleTaskPatch 空名称返回 400", async () => {
  await withTaskContext(async (ctx) => {
    const state = ctx.store.create({
      sessionId: "session-patch",
      cwd: "/tmp/proj",
      title: "旧标题",
      source: "task",
    });
    const result = await handleTaskPatch(state.id, { name: "  " });
    assert.equal(result.status, 400);
    const body = result.body as { error?: Record<string, unknown> };
    assert.equal(body.error?.code, "bad_request");
  });
});

test("handleTaskCommands 非法命令返回 400", async () => {
  await withTaskContext(async (ctx) => {
    const state = ctx.store.create({
      sessionId: "session-command",
      cwd: "/tmp/proj",
      title: "命令测试",
      source: "task",
    });
    const result = await handleTaskCommands(state.id, { type: "unknown_command" });
    assert.equal(result.status, 400);
    const body = result.body as { error?: Record<string, unknown> };
    assert.equal(body.error?.code, "bad_request");
  });
});

test("handleTasksGet 正常路径仍返回 200", async () => {
  await withTaskContext(async (ctx) => {
    ctx.store.create({ sessionId: "session-list", cwd: "/tmp/proj", title: "列表", source: "task" });
    const result = await handleTasksGet(new URLSearchParams());
    assert.equal(result.status, 200);
    const body = result.body as { total?: number; tasks?: unknown[] };
    assert.equal(body.total, 1);
    assert.equal(body.tasks?.length, 1);
  });
});

test("handleTaskEvents 不存在任务返回 404 结构化错误", async () => {
  await withTaskContext(() => {
    const result = handleTaskEvents("missing-task", new URLSearchParams());
    assert.equal(result.status, 404);
    const body = result.body as { error?: Record<string, unknown> };
    assert.equal(body.error?.code, "task_not_found");
  });
});

test("resolveTaskAfterSeq 缺省只看实时，重连头与显式查询正确合并", () => {
  assert.equal(resolveTaskAfterSeq(null, undefined, 10), 10);
  assert.equal(resolveTaskAfterSeq(null, "7", 10), 7);
  assert.equal(resolveTaskAfterSeq("5", "7", 10), 7);
  assert.equal(resolveTaskAfterSeq("7", "5", 10), 7);
  assert.equal(resolveTaskAfterSeq("999", "7", 10), 10);
  assert.equal(resolveTaskAfterSeq("0", null, 10), 0);
  assert.equal(resolveTaskAfterSeq("bad", null, 10), 10);
  assert.equal(resolveTaskAfterSeq(null, "bad", 10), 10);
});

interface SseFrame {
  id: string;
  data: Record<string, unknown>;
}

function readSseFrames(chunks: string[]): SseFrame[] {
  return chunks
    .join("")
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const idLine = frame.split("\n").find((line) => line.startsWith("id: ")) ?? "";
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: ")) ?? "";
      return {
        id: idLine.slice("id: ".length),
        data: JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>,
      };
    });
}

test("handleTaskEvents 首次订阅不重放历史事件", async () => {
  await withTaskContext(async (ctx) => {
    const state = ctx.store.create({ sessionId: "session-events", cwd: "/tmp/proj", title: "事件流", source: "task" });
    await ctx.hub.emit(state.id, "task_updated", { status: "running" });
    await ctx.hub.emit(state.id, "message_delta", { delta: "历史文本" });

    const result = handleTaskEvents(state.id, new URLSearchParams());
    assert.equal(result.status, 200);
    const chunks: string[] = [];
    const cleanup = result.stream?.(chunk => chunks.push(chunk), () => {});
    cleanup?.();

    const frames = readSseFrames(chunks);
    assert.equal(frames.length, 1);
    const connectedPayload = frames[0]?.data.data as Record<string, unknown> | undefined;
    assert.equal(connectedPayload?.kind, "connected");
    assert.equal(connectedPayload?.backlogCount, 0);
    assert.equal(frames[0]?.id, String(state.lastEventSeq));
  });
});

test("handleTaskEvents 按 Last-Event-ID 只补发缺失事件", async () => {
  await withTaskContext(async (ctx) => {
    const state = ctx.store.create({ sessionId: "session-replay", cwd: "/tmp/proj", title: "重连补发", source: "task" });
    await ctx.hub.emit(state.id, "task_updated", { status: "running" });
    await ctx.hub.emit(state.id, "message_delta", { delta: "一" });
    await ctx.hub.emit(state.id, "message_delta", { delta: "二" });

    const result = handleTaskEvents(state.id, new URLSearchParams(), "1");
    const chunks: string[] = [];
    const cleanup = result.stream?.(chunk => chunks.push(chunk), () => {});
    cleanup?.();

    const frames = readSseFrames(chunks);
    const connectedPayload = frames[0]?.data.data as Record<string, unknown> | undefined;
    assert.equal(connectedPayload?.kind, "connected");
    assert.equal(connectedPayload?.backlogCount, 2);
    assert.deepEqual(
      frames.slice(1).map(frame => frame.data.type),
      ["message_delta", "message_delta"],
    );
    assert.deepEqual(frames.slice(1).map(frame => frame.id), ["2", "3"]);
  });
});

