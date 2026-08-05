import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskSections,
  createTaskSummaries,
  formatRelativeTime,
  type TaskSummary,
} from "../src/features/workbench/taskPresentation.ts";

const now = "2026-08-05T08:00:00.000Z";

function task(overrides: Partial<TaskSummary>): TaskSummary {
  return {
    id: "task-default",
    title: "默认任务",
    projectName: "Yunfeng",
    section: "completed",
    statusLabel: "已完成",
    currentAction: "已验证",
    updatedAt: "2026-08-05T07:00:00.000Z",
    ...overrides,
  };
}

test("buildTaskSections 按注意力顺序分组，并隐藏空分组", () => {
  const sections = buildTaskSections([
    task({ id: "done", section: "completed", updatedAt: "2026-08-05T07:00:00.000Z" }),
    task({ id: "running", section: "running", updatedAt: "2026-08-05T07:50:00.000Z" }),
    task({ id: "attention", section: "attention", updatedAt: "2026-08-05T07:30:00.000Z" }),
    task({ id: "waiting", section: "waiting", updatedAt: "2026-08-05T07:40:00.000Z" }),
  ]);

  assert.deepEqual(
    sections.map((section) => section.id),
    ["attention", "running", "waiting", "completed"],
  );
  assert.equal(sections[0]?.tasks[0]?.id, "attention");
});

test("buildTaskSections 在同一分组中把最近更新的任务放在前面", () => {
  const sections = buildTaskSections([
    task({ id: "older", section: "running", updatedAt: "2026-08-05T07:10:00.000Z" }),
    task({ id: "newer", section: "running", updatedAt: "2026-08-05T07:55:00.000Z" }),
  ]);

  assert.deepEqual(sections[0]?.tasks.map((item) => item.id), ["newer", "older"]);
});

test("createTaskSummaries 把运行会话映射为正在进行任务，其余会话保留为已完成", () => {
  const summaries = createTaskSummaries(
    [
      {
        id: "running-session",
        name: "",
        firstMessage: "修复会话恢复问题",
        cwd: "/Volumes/base/project/Yunfeng",
        modified: "2026-08-05T07:55:00.000Z",
        messageCount: 4,
      },
      {
        id: "finished-session",
        name: "论文阅读",
        firstMessage: "收集论文",
        cwd: "/Volumes/base/project/Research",
        modified: "2026-08-04T07:55:00.000Z",
        messageCount: 8,
      },
    ],
    ["running-session"],
  );

  assert.deepEqual(summaries[0], {
    id: "running-session",
    title: "修复会话恢复问题",
    projectName: "Yunfeng",
    section: "running",
    statusLabel: "正在进行",
    currentAction: "Agent 正在工作",
    primaryAction: { label: "查看任务", kind: "open" },
    updatedAt: "2026-08-05T07:55:00.000Z",
  });
  assert.equal(summaries[1]?.title, "论文阅读");
  assert.equal(summaries[1]?.projectName, "Research");
  assert.equal(summaries[1]?.section, "completed");
});

test("createTaskSummaries 把带有介入原因的会话提升为需要介入", () => {
  const [summary] = createTaskSummaries([
    {
      id: "approval-session",
      name: "发布前检查",
      firstMessage: "检查发布风险",
      cwd: "/Volumes/base/project/Yunfeng",
      modified: "2026-08-05T07:59:00.000Z",
      messageCount: 5,
      attentionReason: "发现两种实现路径，需要你选择",
    },
  ], []);

  assert.equal(summary?.section, "attention");
  assert.equal(summary?.attentionReason, "发现两种实现路径，需要你选择");
  assert.deepEqual(summary?.primaryAction, { label: "查看任务", kind: "open" });
});

test("formatRelativeTime 使用简洁的中文相对时间", () => {
  assert.equal(formatRelativeTime("2026-08-05T07:59:40.000Z", now), "刚刚");
  assert.equal(formatRelativeTime("2026-08-05T07:58:00.000Z", now), "2 分钟前");
  assert.equal(formatRelativeTime("2026-08-05T06:00:00.000Z", now), "2 小时前");
  assert.equal(formatRelativeTime("2026-08-04T07:00:00.000Z", now), "昨天");
});
