// 通知纯逻辑单测：开关持久化与任务状态 → 通知文案映射。

import { describe, expect, it } from "vitest";
import {
  loadNotificationsEnabled,
  saveNotificationsEnabled,
  taskTransitionNotice,
} from "./notifications";
import type { TaskState } from "./types";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: map.size,
  };
}

function task(status: TaskState["status"]): TaskState {
  return {
    schemaVersion: 1,
    id: "t1",
    sessionId: "s1",
    cwd: "/tmp",
    title: "测试任务",
    source: "task",
    status,
    phase: "unknown",
    currentAction: "",
    activeToolNames: [],
    pendingApprovalIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastEventSeq: 0,
  };
}

describe("通知开关持久化", () => {
  it("默认关闭，保存后开启", () => {
    const storage = fakeStorage();
    expect(loadNotificationsEnabled(storage)).toBe(false);
    saveNotificationsEnabled(true, storage);
    expect(loadNotificationsEnabled(storage)).toBe(true);
    saveNotificationsEnabled(false, storage);
    expect(loadNotificationsEnabled(storage)).toBe(false);
  });
});

describe("taskTransitionNotice", () => {
  it("completed/failed/waiting_approval 生成文案", () => {
    expect(taskTransitionNotice(task("completed"))).toEqual({
      title: "任务已完成",
      body: "测试任务 已执行完成",
    });
    expect(taskTransitionNotice(task("failed"))?.title).toBe("任务失败");
    expect(taskTransitionNotice(task("waiting_approval"))?.title).toBe("任务等待审批");
    expect(taskTransitionNotice(task("waiting_input"))?.title).toBe("任务等待输入");
  });

  it("running/archived 无通知", () => {
    expect(taskTransitionNotice(task("running"))).toBeNull();
    expect(taskTransitionNotice(task("archived"))).toBeNull();
  });
});
