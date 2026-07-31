// 会话条目 → UI 消息映射单测（纯函数，不依赖 pi SDK 运行）。

import { describe, expect, it } from "bun:test";
import { entryToUiMessage } from "./sessions";

describe("entryToUiMessage", () => {
  it("message 条目原样透传", () => {
    const msg = { role: "user", content: "hi", timestamp: "t" };
    expect(entryToUiMessage({ type: "message", message: msg })).toBe(msg);
  });

  it("compaction 条目映射为 custom 消息", () => {
    const result = entryToUiMessage({
      type: "compaction",
      summary: "summary text",
      tokensBefore: 100,
      firstKeptEntryId: "e1",
      timestamp: "t1",
    });
    expect(result).toEqual({
      role: "custom",
      customType: "compaction",
      content: "summary text",
      display: true,
      details: { tokensBefore: 100, firstKeptEntryId: "e1" },
      timestamp: "t1",
    });
  });

  it("branch_summary 有条目时映射为 user 消息，无 summary 返回 null", () => {
    const result = entryToUiMessage({ type: "branch_summary", summary: "explored", timestamp: "t2" });
    expect(result?.role).toBe("user");
    expect(result?.content).toMatch(/briefly explored another branch/);
    expect(entryToUiMessage({ type: "branch_summary", timestamp: "t2" })).toBeNull();
  });

  it("custom_message 条目透传字段", () => {
    expect(
      entryToUiMessage({
        type: "custom_message",
        customType: "tool_call",
        content: "c",
        display: false,
        details: { x: 1 },
        timestamp: "t3",
      }),
    ).toEqual({
      role: "custom",
      customType: "tool_call",
      content: "c",
      display: false,
      details: { x: 1 },
      timestamp: "t3",
    });
  });

  it("未知条目类型返回 null", () => {
    expect(entryToUiMessage({ type: "unknown_type" })).toBeNull();
  });
});
