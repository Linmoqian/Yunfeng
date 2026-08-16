// 任务事件归约单测：SSE 事件 → 任务视图状态。

import { describe, expect, it } from "vitest";
import {
  initialTaskView,
  STREAMING_ID,
  taskViewReducer,
  type TaskViewState,
} from "./taskEvents";
import type { TaskState, TaskStreamEvent } from "./types";

function view(state?: TaskViewState): TaskViewState {
  return state ?? initialTaskView();
}

function apply(state: TaskViewState, event: TaskStreamEvent): TaskViewState {
  return taskViewReducer(state, { type: "stream-event", event });
}

function task(): TaskState {
  return {
    schemaVersion: 1,
    id: "t1",
    sessionId: "s1",
    cwd: "/tmp",
    title: "任务",
    source: "task",
    status: "running",
    phase: "implementing",
    currentAction: "",
    activeToolNames: [],
    pendingApprovalIds: [],
    createdAt: "",
    updatedAt: "",
    lastEventSeq: 0,
  };
}

describe("taskViewReducer 流事件", () => {
  it("message_delta 累积到流式消息", () => {
    let state = view();
    state = apply(state, { type: "message_delta", data: { delta: "你" } });
    state = apply(state, { type: "message_delta", data: { delta: "好" } });
    expect(state.isStreaming).toBe(true);
    expect(state.streamingMessage?.content).toEqual([{ type: "text", text: "你" }, { type: "text", text: "好" }]);
  });

  it("message_completed 把流式消息提交进 messages", () => {
    let state = view();
    state = apply(state, { type: "message_delta", data: { delta: "完成" } });
    state = apply(state, { type: "message_completed", id: "m1" });
    expect(state.streamingMessage).toBeNull();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.id).toBe("assistant-m1");
    expect(state.isStreaming).toBe(false);
  });

  it("tool_started / tool_finished 维护工具列表", () => {
    let state = view();
    state = apply(state, { type: "tool_started", data: { callId: "c1", name: "bash" } });
    expect(state.runningTools).toEqual([{ id: "c1", name: "bash" }]);
    state = apply(state, { type: "tool_finished", data: { callId: "c1" } });
    expect(state.runningTools).toEqual([]);
  });

  it("run_failed 置错误并清空工具", () => {
    let state = view();
    state = apply(state, { type: "tool_started", data: { callId: "c1", name: "bash" } });
    state = apply(state, { type: "run_failed", data: { action: "编译失败" } });
    expect(state.error).toBe("编译失败");
    expect(state.streamStatus).toBe("error");
    expect(state.runningTools).toEqual([]);
  });

  it("approval_requested 增加审批卡，resolved 移除", () => {
    let state = view();
    state = apply(state, {
      type: "approval_requested",
      data: { requestId: "r1", kind: "select", title: "选择分支", options: ["main"] },
    });
    expect(state.approvals).toHaveLength(1);
    expect(state.approvals[0]?.kind).toBe("select");
    state = apply(state, { type: "approval_resolved", data: { requestId: "r1" } });
    expect(state.approvals).toHaveLength(0);
    expect(state.notice).toBeNull();
  });
});

describe("taskViewReducer 动作", () => {
  it("open 重置状态并进入 connecting", () => {
    const state = taskViewReducer(
      { ...view(), error: "旧错误", approvals: [{ requestId: "r", kind: "confirm", title: "t", message: "" }] },
      { type: "open", task: task() },
    );
    expect(state.task?.id).toBe("t1");
    expect(state.error).toBeNull();
    expect(state.approvals).toHaveLength(0);
    expect(state.streamStatus).toBe("connecting");
  });

  it("stream-connected 切换连接状态", () => {
    const state = taskViewReducer(view(), { type: "stream-connected", connected: false });
    expect(state.streamStatus).toBe("connecting");
    expect(taskViewReducer(state, { type: "stream-connected", connected: true }).streamStatus).toBe("idle");
  });

  it("user-message 追加并清除旧错误", () => {
    const state = taskViewReducer(
      { ...view(), error: "上次失败" },
      { type: "user-message", message: { id: "u1", role: "user", content: "继续" } },
    );
    expect(state.error).toBeNull();
    expect(state.messages).toHaveLength(1);
  });

  it("resolve-approval 乐观移除审批卡", () => {
    const state = taskViewReducer(
      {
        ...view(),
        approvals: [{ requestId: "r1", kind: "confirm", title: "t", message: "" }],
        notice: "t",
      },
      { type: "resolve-approval", requestId: "r1" },
    );
    expect(state.approvals).toHaveLength(0);
    expect(state.notice).toBeNull();
  });

  it("流式消息 id 使用固定 STREAMING_ID", () => {
    const state = apply(view(), { type: "message_delta", data: { delta: "x" } });
    expect(state.streamingMessage?.id).toBe(STREAMING_ID);
  });
});
