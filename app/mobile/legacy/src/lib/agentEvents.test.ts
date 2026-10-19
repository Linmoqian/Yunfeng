import { describe, expect, it } from "vitest";
import { agentReducer, initialAgents } from "./agentEvents";

describe("agentReducer", () => {
  it("agent_update 更新对应 Agent 状态与活动", () => {
    let list = initialAgents();
    expect(list.find((a) => a.id === "lead")?.status).toBe("working");

    list = agentReducer(list, {
      type: "agent_update",
      agentId: "lead",
      status: "idle",
      activity: "空闲",
    });
    expect(list.find((a) => a.id === "lead")).toMatchObject({ status: "idle", activity: "空闲" });

    // 未受影响 Agent 不变
    expect(list.find((a) => a.id === "code")).toBeDefined();
  });

  it("仅更新活动字段时保留原状态", () => {
    let list = initialAgents();
    list = agentReducer(list, { type: "agent_update", agentId: "test", activity: "正在运行测试" });
    expect(list.find((a) => a.id === "test")).toMatchObject({
      status: "online",
      activity: "正在运行测试",
    });
  });

  it("非 agent_update 事件不改变状态", () => {
    const list = initialAgents();
    expect(agentReducer(list, { type: "message_update" })).toBe(list);
  });
});
