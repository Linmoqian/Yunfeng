// 核心创建契约：普通会话与指定项目的科研任务。
// Created on 2026-10-18
// @author: https://github.com/Linmoqian
import assert from "node:assert/strict";
import test from "node:test";

import { createConversation } from "../src/services/taskService.ts";

test("科研任务携带模式和项目目录走现有创建接口", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let payload: unknown;
  globalThis.fetch = (async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ task: { id: "research" }, sessionId: "research-runtime" }), { status: 200 });
  }) as typeof fetch;
  const decisionModel = { provider: "local", modelId: "decision-small" };
  await createConversation(null, "验证实验结果", { mode: "research", cwd: "/example/project", decisionModel, decisionBudget: 2, skills: ["experimental-design"] });
  assert.deepEqual(payload, { message: "验证实验结果", mode: "research", cwd: "/example/project", decisionModel, decisionBudget: 2, skills: ["experimental-design"] });
});

test("createConversation 不要求目录或首条消息", async (context) => {
  const originalFetch = globalThis.fetch;
  let payload: unknown;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      task: { id: "task-conversation" },
      sessionId: "session-conversation",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const result = await createConversation({ provider: "openai", modelId: "gpt-5" });

  assert.deepEqual(payload, { model: { provider: "openai", modelId: "gpt-5" } });
  assert.equal(result.task.id, "task-conversation");
  assert.equal(result.sessionId, "session-conversation");
});

test("createConversation 在首条输入时携带消息创建会话", async (context) => {
  const originalFetch = globalThis.fetch;
  let payload: unknown;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      task: { id: "task-first-message" },
      sessionId: "session-first-message",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  await createConversation({ provider: "openai", modelId: "gpt-5" }, "你好，开始新的对话。");

  assert.deepEqual(payload, {
    model: { provider: "openai", modelId: "gpt-5" },
    message: "你好，开始新的对话。",
  });
});
