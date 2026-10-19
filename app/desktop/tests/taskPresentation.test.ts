// 会话展示映射与分组核心回归。
// Created on 2026-10-19
// @author: https://github.com/Linmoqian
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskSections,
  selectMostRecentActiveTask,
  sessionToLegacySummary,
  taskToSummary,
  type TaskSummary,
} from "../src/features/workbench/taskPresentation.ts";
import type { TaskState } from "../src/services/taskService.ts";

function taskState(overrides: Partial<TaskState>): TaskState {
  return {
    schemaVersion: 1,
    id: "task-default",
    sessionId: "session-default",
    cwd: "/Volumes/base/project/Yunfeng",
    title: "默认任务",
    source: "task",
    status: "completed",
    phase: "done",
    currentAction: "",
    activeToolNames: [],
    pendingApprovalIds: [],
    createdAt: "2026-08-05T06:00:00.000Z",
    updatedAt: "2026-08-05T07:00:00.000Z",
    lastEventSeq: 0,
    ...overrides,
  };
}

function summary(overrides: Partial<TaskSummary>): TaskSummary {
  return {
    id: "task-default",
    sessionId: "session-default",
    title: "默认任务",
    projectName: "Yunfeng",
    section: "completed",
    statusLabel: "已完成",
    currentAction: "已验证",
    updatedAt: "2026-08-05T07:00:00.000Z",
    isLegacy: false,
    status: "completed",
    phase: "done",
    cwd: "/Volumes/base/project/Yunfeng",
    ...overrides,
  };
}

test("sessionToLegacySummary 把旧会话标记为 history 且不推断完成", () => {
  const legacy = sessionToLegacySummary({
    id: "legacy-session",
    name: "旧对话",
    firstMessage: "",
    cwd: "/Volumes/base/project/Research",
    modified: "2026-08-04T07:55:00.000Z",
    messageCount: 8,
  });
  assert.equal(legacy.isLegacy, true);
  assert.equal(legacy.status, "history");
  assert.equal(legacy.section, "legacy");
  assert.equal(legacy.mode, undefined);
});

test("会话模式来自任务事实，旧任务遵循开发默认值且不按标题猜测科研", () => {
  assert.equal(taskToSummary(taskState({ mode: "research", title: "你好" })).mode, "research");
  assert.equal(taskToSummary(taskState({ mode: "development", title: "科研实验" })).mode, "development");
  assert.equal(taskToSummary(taskState({})).mode, "development");
});

test("buildTaskSections 按介入优先级分组，并隐藏空分组", () => {
  const sections = buildTaskSections([
    summary({ id: "done", section: "completed", updatedAt: "2026-08-05T07:00:00.000Z" }),
    summary({ id: "running", section: "running", updatedAt: "2026-08-05T07:50:00.000Z" }),
    summary({ id: "attention", section: "attention", updatedAt: "2026-08-05T07:30:00.000Z" }),
    summary({ id: "waiting", section: "waiting", updatedAt: "2026-08-05T07:40:00.000Z" }),
    summary({ id: "legacy", section: "legacy", updatedAt: "2026-08-04T07:00:00.000Z" }),
  ]);

  assert.deepEqual(
    sections.map((section) => section.id),
    ["attention", "running", "waiting", "completed", "legacy"],
  );
  assert.equal(sections[0]?.tasks[0]?.id, "attention");
});

test("buildTaskSections 归档任务默认隐藏，开启归档可见后展示", () => {
  const archived = summary({ id: "archived", section: "archived", updatedAt: "2026-08-05T07:00:00.000Z" });
  const hidden = buildTaskSections([archived], false);
  assert.deepEqual(hidden.map((section) => section.id), []);

  const visible = buildTaskSections([archived], true);
  assert.deepEqual(visible.map((section) => section.id), ["archived"]);
  assert.equal(visible[0]?.tasks[0]?.id, "archived");
});

test("selectMostRecentActiveTask 选择最近更新的未结束任务", () => {
  const selected = selectMostRecentActiveTask([
    taskState({ id: "completed", status: "completed", updatedAt: "2026-08-05T08:00:00.000Z" }),
    taskState({ id: "archived", status: "archived", updatedAt: "2026-08-05T07:55:00.000Z" }),
    taskState({ id: "older", status: "waiting_input", updatedAt: "2026-08-05T07:00:00.000Z" }),
    taskState({ id: "newer", status: "running", updatedAt: "2026-08-05T07:30:00.000Z" }),
  ]);

  assert.equal(selected?.id, "newer");
});
