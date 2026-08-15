// 工作台 Redux 状态测试：SSE 任务快照只能更新 tasks，不得覆盖旧会话列表。

import assert from "node:assert/strict";
import test from "node:test";
import { configureStore } from "@reduxjs/toolkit";

import workbenchReducer, { workbenchActions } from "../src/store/workbenchSlice.ts";
import type { SessionSnapshot, TaskState } from "../src/services/taskService.ts";

function task(overrides: Partial<TaskState>): TaskState {
  return {
    schemaVersion: 1,
    id: "task-1",
    sessionId: "session-1",
    cwd: "/tmp/proj",
    title: "任务",
    source: "task",
    status: "waiting_input",
    phase: "unknown",
    currentAction: "",
    activeToolNames: [],
    pendingApprovalIds: [],
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    lastEventSeq: 0,
    ...overrides,
  };
}

function session(id: string): SessionSnapshot {
  return {
    id,
    name: `旧会话 ${id}`,
    firstMessage: "历史消息",
    cwd: "/tmp/proj",
    modified: "2026-08-14T00:00:00.000Z",
    messageCount: 1,
  };
}

function makeStore() {
  return configureStore({ reducer: { workbench: workbenchReducer } });
}

test("tasksSnapshot 更新任务并保留已有旧会话", () => {
  const store = makeStore();
  store.dispatch(workbenchActions.snapshot({
    tasks: [task({ id: "old-task", status: "running" })],
    sessions: [session("legacy-1"), session("legacy-2")],
  }));

  store.dispatch(workbenchActions.tasksSnapshot([
    task({ id: "new-task", status: "failed" }),
  ]));

  const state = store.getState().workbench;
  assert.deepEqual(state.sessions.map((item) => item.id), ["legacy-1", "legacy-2"]);
  assert.deepEqual(state.tasks.map((item) => item.id), ["new-task"]);
  assert.equal(state.attentionCount, 1);
});

test("tasksSnapshot 按新任务重算注意力数量", () => {
  const store = makeStore();
  store.dispatch(workbenchActions.tasksSnapshot([
    task({ id: "failed-1", status: "failed" }),
    task({ id: "approval-1", status: "waiting_approval" }),
    task({ id: "running-1", status: "running" }),
  ]));

  assert.equal(store.getState().workbench.attentionCount, 2);
});
