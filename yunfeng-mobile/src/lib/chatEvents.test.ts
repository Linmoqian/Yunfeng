import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "./chatEvents";
import type { AgentEvent } from "./types";

function ev(type: string, extra: Record<string, unknown> = {}): AgentEvent {
  return { type, ...extra };
}

describe("chatReducer", () => {
  it("message_update 进入流式状态，message_end 收尾", () => {
    const s1 = chatReducer(initialChatState, ev("message_update", {
      message: { role: "assistant", content: [{ type: "text", text: "你" }] },
    }));
    expect(s1.isStreaming).toBe(true);
    expect(s1.streamingMessage).not.toBeNull();

    const s2 = chatReducer(s1, ev("message_end", {
      message: { role: "assistant", content: "你好" },
    }));
    expect(s2.isStreaming).toBe(false);
    expect(s2.streamingMessage).toBeNull();
    expect(s2.messages).toHaveLength(1);
  });

  it("工具生命周期：start -> update -> end(done)", () => {
    let s = chatReducer(initialChatState, ev("tool_execution_start", { toolCallId: "t1", toolName: "任务拆解" }));
    expect(s.tools).toEqual([{ id: "t1", name: "任务拆解", status: "running" }]);

    s = chatReducer(s, ev("tool_execution_update", { toolCallId: "t1", message: "拆解中…" }));
    expect(s.tools[0].message).toBe("拆解中…");

    s = chatReducer(s, ev("tool_execution_start", { toolCallId: "t1", toolName: "任务拆解" }));
    expect(s.tools).toHaveLength(1);

    s = chatReducer(s, ev("tool_execution_end", { toolCallId: "t1", result: "3 个子任务" }));
    expect(s.tools[0]).toMatchObject({ status: "done", result: "3 个子任务" });
  });

  it("工具失败：tool_execution_error -> failed", () => {
    let s = chatReducer(initialChatState, ev("tool_execution_start", { toolCallId: "t2", toolName: "代码审查" }));
    s = chatReducer(s, ev("tool_execution_error", { toolCallId: "t2", errorMessage: "权限不足" }));
    expect(s.tools[0]).toMatchObject({ status: "failed", error: "权限不足" });
  });

  it("prompt_error 记录错误并停止流式", () => {
    const s1 = chatReducer(initialChatState, ev("message_update", { message: { role: "assistant", content: "x" } }));
    const s2 = chatReducer(s1, ev("prompt_error", { errorMessage: "boom" }));
    expect(s2.error).toBe("boom");
    expect(s2.isStreaming).toBe(false);
  });

  it("agent_end / prompt_done 停止流式", () => {
    const s1 = chatReducer(initialChatState, ev("message_update", { message: { role: "assistant", content: "x" } }));
    expect(chatReducer(s1, ev("agent_end")).isStreaming).toBe(false);
    expect(chatReducer(s1, ev("prompt_done")).isStreaming).toBe(false);
  });
});
