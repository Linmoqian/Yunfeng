import assert from "node:assert/strict";
import test from "node:test";

import { buildConversationBranchTree } from "../src/features/workbench/conversationInfo.ts";
import type { SessionSnapshot } from "../src/services/taskService.ts";

function session(overrides: Partial<SessionSnapshot>): SessionSnapshot {
  return {
    id: "session-default",
    name: "",
    firstMessage: "默认对话",
    cwd: "/Volumes/base/project/Yunfeng",
    modified: "2026-08-07T08:00:00.000Z",
    messageCount: 2,
    ...overrides,
  };
}

test("buildConversationBranchTree 构建包含当前节点的真实父子分支树", () => {
  const tree = buildConversationBranchTree([
    session({ id: "root", firstMessage: "根对话" }),
    session({ id: "current", firstMessage: "旧标题", parentSessionId: "root" }),
    session({ id: "sibling", firstMessage: "同级分支", parentSessionId: "root" }),
    session({ id: "child", firstMessage: "子分支", parentSessionId: "current" }),
  ], "current", "当前对话");

  assert.equal(tree[0].id, "root");
  assert.equal(tree[0].children.length, 2);
  const current = tree[0].children.find((node) => node.id === "current");
  assert.equal(current?.current, true);
  assert.equal(current?.title, "当前对话");
  assert.equal(current?.children[0].id, "child");
});
