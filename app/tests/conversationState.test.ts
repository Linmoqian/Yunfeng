import assert from "node:assert/strict";
import test from "node:test";

import { mergeConversation, type ConversationItem } from "../src/features/workbench/conversationState.ts";

function message(id: string, text: string): ConversationItem {
  return { id, role: "user", text, status: "sent" };
}

test("mergeConversation 保留与历史同文的后发用户消息", () => {
  const prior = message("server-1", "继续");
  const optimistic = message("local-2", "继续");

  const merged = mergeConversation([prior, optimistic], [prior]);

  assert.deepEqual(merged.map((item) => item.id), ["server-1", "local-2"]);
});

test("mergeConversation 在服务端确认后移除对应乐观副本", () => {
  const prior = message("server-1", "继续");
  const optimistic = message("local-2", "继续");
  const confirmed = message("server-2", "继续");

  const merged = mergeConversation([prior, optimistic], [prior, confirmed]);

  assert.deepEqual(merged.map((item) => item.id), ["server-1", "server-2"]);
});
