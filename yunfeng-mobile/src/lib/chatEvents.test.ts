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

  it("工具事件维护运行中列表", () => {
    const s1 = chatReducer(initialChatState, ev("tool_execution_start", { toolCallId: "t1", toolName: "代码审查" }));
    expect(s1.runningTools).toEqual([{ id: "t1", name: "代码审查" }]);
    const s2 = chatReducer(s1, ev("tool_execution_start", { toolCallId: "t1", toolName: "代码审查" }));
    expect(s2.runningTools).toHaveLength(1);
    const s3 = chatReducer(s2, ev("tool_execution_end", { toolCallId: "t1" }));
    expect(s3.runningTools).toHaveLength(0);
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
