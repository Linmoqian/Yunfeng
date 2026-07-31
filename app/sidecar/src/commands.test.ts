// 命令分发单测：用部分 mock 的 AgentSession 构造 wrapper，验证 executeCommand。

import { describe, expect, it, mock } from "bun:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { executeCommand } from "./commands";
import { AgentSessionWrapper } from "./wrapper";

function makeWrapper(overrides: Partial<AgentSession> = {}): AgentSessionWrapper {
  const inner = {
    sessionId: "s1",
    sessionFile: "/tmp/s1.jsonl",
    isStreaming: false,
    isBashRunning: false,
    isCompacting: false,
    autoCompactionEnabled: false,
    autoRetryEnabled: true,
    pendingMessageCount: 0,
    model: undefined,
    agent: { state: { systemPrompt: "default", thinkingLevel: "off" } },
    sessionManager: { getCwd: () => "/tmp", getSessionName: () => "s1" },
    subscribe: () => () => {},
    prompt: async () => {},
    abort: async () => {},
    getContextUsage: () => null,
    getSteeringMessages: () => [],
    getFollowUpMessages: () => [],
    getAllTools: () => [],
    getActiveToolNames: () => [],
    getLastAssistantText: () => "hello",
    getSessionStats: () => ({ messageCount: 1 }),
    setSessionName: () => {},
    setAutoCompactionEnabled: () => {},
    setActiveToolsByName: () => {},
    setThinkingLevel: () => {},
    setModel: async () => {},
    modelRuntime: { getModel: async () => undefined },
    abortBash: () => {},
    reload: async () => {},
    clearQueue: () => ({ success: true }),
    ...overrides,
  } as unknown as AgentSession;
  return new AgentSessionWrapper(inner);
}

describe("executeCommand", () => {
  it("未知命令抛出 Unsupported command", async () => {
    const w = makeWrapper();
    await expect(executeCommand(w, { type: "nope" })).rejects.toThrow("Unsupported command: nope");
  });

  it("abort 转发到 inner.abort", async () => {
    const abort = mock(async () => {});
    const w = makeWrapper({ abort } as Partial<AgentSession>);
    await executeCommand(w, { type: "abort" });
    expect(abort).toHaveBeenCalled();
  });

  it("set_session_name 空名拒绝，正常名转发并清空", async () => {
    const setSessionName = mock(() => {});
    const w = makeWrapper({ setSessionName } as Partial<AgentSession>);
    await expect(executeCommand(w, { type: "set_session_name", name: "  " })).rejects.toThrow(
      "Session name cannot be empty",
    );
    await executeCommand(w, { type: "set_session_name", name: " 我的会话 " });
    expect(setSessionName).toHaveBeenCalledWith("我的会话");
  });

  it("get_last_assistant_text 返回 text，null 时为空串", async () => {
    const w = makeWrapper({ getLastAssistantText: () => "hi" } as Partial<AgentSession>);
    await expect(executeCommand(w, { type: "get_last_assistant_text" })).resolves.toEqual({ text: "hi" });
    const w2 = makeWrapper({ getLastAssistantText: () => undefined } as Partial<AgentSession>);
    await expect(executeCommand(w2, { type: "get_last_assistant_text" })).resolves.toEqual({ text: "" });
  });

  it("get_tools 按 active 集合标记", async () => {
    const w = makeWrapper({
      getAllTools: () => [
        { name: "bash", description: "run" },
        { name: "read", description: "read" },
      ],
      getActiveToolNames: () => ["bash"],
    } as Partial<AgentSession>);
    await expect(executeCommand(w, { type: "get_tools" })).resolves.toEqual([
      { name: "bash", description: "run", active: true },
      { name: "read", description: "read", active: false },
    ]);
  });

  it("set_tools 空数组时强制空 system prompt", async () => {
    const w = makeWrapper();
    await executeCommand(w, { type: "set_tools", toolNames: [] });
    expect((w.inner.agent.state as { systemPrompt: string }).systemPrompt).toBe("");
    const w2 = makeWrapper();
    await executeCommand(w2, { type: "set_tools", toolNames: ["bash"] });
    expect((w2.inner.agent.state as { systemPrompt: string }).systemPrompt).toBe("default");
  });

  it("get_state 返回完整结构，contextUsage 为 null", async () => {
    const w = makeWrapper();
    const state = (await executeCommand(w, { type: "get_state" })) as Record<string, unknown>;
    expect(state.sessionId).toBe("s1");
    expect(state.isPromptRunning).toBe(false);
    expect(state.contextUsage).toBeNull();
    expect(state.thinkingLevel).toBe("off");
  });

  it("prompt 在 bash 运行时拒绝", async () => {
    const w = makeWrapper({ isBashRunning: true } as Partial<AgentSession>);
    await expect(executeCommand(w, { type: "prompt", message: "hi" })).rejects.toThrow(
      "Cannot send a prompt while a shell command is running",
    );
  });

  it("prompt 完成时置位/复位 promptRunning 并广播 prompt_done", async () => {
    let resolvePrompt: (() => void) | undefined;
    const prompt = mock(() => new Promise<void>((resolve) => { resolvePrompt = resolve; }));
    const w = makeWrapper({ prompt } as Partial<AgentSession>);
    const events: string[] = [];
    w.onEvent((e) => events.push(e.type));

    const p = executeCommand(w, { type: "prompt", message: "hi" });
    expect(w.promptRunning).toBe(true);
    resolvePrompt?.();
    await p;
    expect(w.promptRunning).toBe(false);
    expect(events).toContain("prompt_done");
  });

  it("prompt 失败时广播 prompt_error 并复位", async () => {
    const prompt = mock(() => Promise.reject(new Error("boom")));
    const w = makeWrapper({ prompt } as Partial<AgentSession>);
    const events: string[] = [];
    w.onEvent((e) => events.push(e.type));
    await executeCommand(w, { type: "prompt", message: "hi" });
    expect(w.promptRunning).toBe(false);
    expect(events).toContain("prompt_error");
  });

  it("steer 带 images 时透传 images", async () => {
    const steer = mock(async () => {});
    const w = makeWrapper({ steer } as Partial<AgentSession>);
    await executeCommand(w, { type: "steer", message: "m", images: [{ type: "image", data: "x", mimeType: "png" }] });
    expect(steer).toHaveBeenCalledWith("m", [{ type: "image", data: "x", mimeType: "png" }]);
    await executeCommand(w, { type: "steer", message: "m2" });
    expect(steer).toHaveBeenLastCalledWith("m2", undefined);
  });

  it("set_auto_compaction 与 clear_queue 转发", async () => {
    const setAutoCompactionEnabled = mock(() => {});
    const w = makeWrapper({ setAutoCompactionEnabled } as Partial<AgentSession>);
    await executeCommand(w, { type: "set_auto_compaction", enabled: true });
    expect(setAutoCompactionEnabled).toHaveBeenCalledWith(true);
    await expect(executeCommand(w, { type: "clear_queue" })).resolves.toEqual({ success: true });
  });
});
