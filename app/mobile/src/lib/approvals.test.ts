// 审批卡映射单测：SSE 事件与干预记录 → ApprovalCard。

import { describe, expect, it } from "vitest";
import { approvalFromEvent, approvalFromIntervention } from "./approvals";

describe("approvalFromEvent", () => {
  it("select 事件保留 options 与 defaultValue", () => {
    const card = approvalFromEvent({
      requestId: "r1",
      kind: "select",
      title: "选择分支",
      message: "合并到哪个分支？",
      options: ["main", "feature/x"],
    });
    expect(card).toEqual({
      requestId: "r1",
      kind: "select",
      title: "选择分支",
      message: "合并到哪个分支？",
      options: ["main", "feature/x"],
    });
  });

  it("input 事件保留 defaultValue", () => {
    const card = approvalFromEvent({
      requestId: "r2",
      kind: "input",
      title: "补充说明",
      message: "请输入发布说明",
      defaultValue: "v0.1.0",
    });
    expect(card?.defaultValue).toBe("v0.1.0");
  });

  it("缺字段时使用安全默认值", () => {
    expect(approvalFromEvent({ requestId: "r3" })).toMatchObject({
      requestId: "r3",
      kind: "confirm",
      title: "Agent 请求审批",
    });
  });

  it("非对象负载返回 null", () => {
    expect(approvalFromEvent(null)).toBeNull();
    expect(approvalFromEvent("text")).toBeNull();
  });
});

describe("approvalFromIntervention", () => {
  it("干预记录的 id 映射为 requestId", () => {
    const card = approvalFromIntervention({
      id: "i1",
      kind: "input",
      title: "发布说明",
      message: "请输入",
      defaultValue: "draft",
    });
    expect(card).toMatchObject({ requestId: "i1", kind: "input", defaultValue: "draft" });
  });

  it("无 id/requestId 时返回 null", () => {
    expect(approvalFromIntervention({ kind: "confirm" })).toBeNull();
  });
});
