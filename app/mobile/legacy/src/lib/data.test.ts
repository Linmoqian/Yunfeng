import { describe, expect, it } from "vitest";
import { agents, quickCommands, sessions } from "./data";

describe("home data contract", () => {
  it("快捷指令与 Agent 数据完整", () => {
    expect(quickCommands.length).toBeGreaterThanOrEqual(6);
    expect(new Set(quickCommands.map((q) => q.id)).size).toBe(quickCommands.length);
    expect(agents.some((a) => a.status === "working")).toBe(true);
  });

  it("会话 id 唯一", () => {
    expect(new Set(sessions.map((s) => s.id)).size).toBe(sessions.length);
  });
});
