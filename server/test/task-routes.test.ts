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
