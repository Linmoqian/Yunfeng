import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskSections,
  formatRelativeTime,
  sessionToLegacySummary,
  taskToSummary,
  type TaskSummary,
} from "../src/features/workbench/taskPresentation.ts";
import type { TaskState } from "../src/services/taskService.ts";

const now = "2026-08-05T08:00:00.000Z";

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

test("taskToSummary 把真实任务状态映射为正确的分组与文案", () => {
  const running = taskToSummary(taskState({ id: "r", status: "running", phase: "implementing" }));
  assert.equal(running.section, "running");
  assert.equal(running.statusLabel, "正在进行");

  const waiting = taskToSummary(taskState({ id: "w", status: "waiting_input" }));
  assert.equal(waiting.section, "waiting");
  assert.equal(waiting.statusLabel, "等待继续");

  const approval = taskToSummary(taskState({ id: "a", status: "waiting_approval" }));
  assert.equal(approval.section, "waiting_approval");
  assert.equal(approval.statusLabel, "等待审批");

  const failed = taskToSummary(taskState({ id: "f", status: "failed", attentionReason: "网络超时" }));
  assert.equal(failed.section, "attention");
  assert.equal(failed.attentionReason, "网络超时");

  const archived = taskToSummary(taskState({ id: "x", status: "archived" }));
  assert.equal(archived.section, "archived");
  assert.equal(archived.statusLabel, "已归档");
});

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
  assert.equal(legacy.statusLabel, "已保存会话");
  assert.equal(legacy.projectName, "Research");
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

test("buildTaskSections 在同一分组中把最近更新的任务放在前面", () => {
  const sections = buildTaskSections([
    summary({ id: "older", section: "running", updatedAt: "2026-08-05T07:10:00.000Z" }),
    summary({ id: "newer", section: "running", updatedAt: "2026-08-05T07:55:00.000Z" }),
  ]);

  assert.deepEqual(sections[0]?.tasks.map((item) => item.id), ["newer", "older"]);
});

test("formatRelativeTime 使用简洁的中文相对时间", () => {
  assert.equal(formatRelativeTime("2026-08-05T07:59:40.000Z", now), "刚刚");
  assert.equal(formatRelativeTime("2026-08-05T07:58:00.000Z", now), "2 分钟前");
  assert.equal(formatRelativeTime("2026-08-05T06:00:00.000Z", now), "2 小时前");
  assert.equal(formatRelativeTime("2026-08-04T07:00:00.000Z", now), "昨天");
});
