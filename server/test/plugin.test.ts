// PluginRegistry 单元测试：init/dispose、分发顺序、错误隔离、链式合并、路由收集。

import { test } from "node:test";
import assert from "node:assert/strict";
import { PluginRegistry } from "../src/plugin/registry.js";
import type { YunfengPlugin } from "../src/plugin/types.js";

function makePlugin(id: string, log: string[]): YunfengPlugin {
  return {
    id,
    init() {
      log.push(`init:${id}`);
    },
    dispose() {
      log.push(`dispose:${id}`);
    },
    on: {
      async agent_end(event) {
        log.push(`agent_end:${id}:${event.sessionId}`);
      },
    },
  };
}

test("init/dispose 按顺序调用，dispose 逆序", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry([makePlugin("a", log), makePlugin("b", log)]);
  await registry.initAll();
  await registry.disposeAll();
  assert.deepEqual(log, ["init:a", "init:b", "dispose:b", "dispose:a"]);
});

test("dispatch 按注册顺序调用所有订阅插件", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry([makePlugin("a", log), makePlugin("b", log)]);
  await registry.initAll();
  await registry.dispatch("agent_end", { sessionId: "s1", cwd: "/tmp" });
  assert.deepEqual(log.filter((l) => l.startsWith("agent_end")), [
    "agent_end:a:s1",
    "agent_end:b:s1",
  ]);
});

test("单插件抛错不阻断后续插件", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry([
    {
      id: "broken",
      on: {
        agent_end() {
          throw new Error("boom");
        },
      },
    },
    makePlugin("ok", log),
  ]);
  await registry.dispatch("agent_end", { sessionId: "s1", cwd: "/tmp" });
  assert.deepEqual(log, ["agent_end:ok:s1"]);
});

test("before_agent_start 链式合并 message 内容", async () => {
  const registry = new PluginRegistry([
    {
      id: "a",
      on: {
        before_agent_start() {
          return { message: { customType: "a", content: "记忆A" } };
        },
      },
    },
    {
      id: "b",
      on: {
        before_agent_start() {
          return { message: { customType: "b", content: "记忆B" } };
        },
      },
    },
  ]);
  const result = await registry.dispatch("before_agent_start", {
    prompt: "帮我改代码",
    systemPrompt: "",
    sessionId: "s1",
    cwd: "/tmp",
  });
  assert.ok(result?.message);
  assert.equal(result!.message!.content, "记忆A\n\n记忆B");
});

test("tool_call 首个 block 短路，后续插件不再调用", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry([
    {
      id: "gate",
      on: {
        tool_call() {
          return { block: true, reason: "危险命令" };
        },
      },
    },
    {
      id: "late",
      on: {
        tool_call() {
          log.push("late-called");
          return undefined;
        },
      },
    },
  ]);
  const result = await registry.dispatch("tool_call", {
    toolName: "bash",
    toolCallId: "c1",
    input: { command: "rm -rf /" },
  });
  assert.equal(result?.block, true);
  assert.deepEqual(log, []);
});

test("collectRoutes 收集插件 HTTP 路由", () => {
  const registry = new PluginRegistry([
    {
      id: "mem",
      routes(r) {
        r.get("/memory", () => ({ status: 200, body: {} }));
        r.patch("/memory/:id", () => ({ status: 200, body: {} }));
      },
    },
  ]);
  const routes = registry.collectRoutes();
  assert.deepEqual(
    routes.map((r) => `${r.method} ${r.path}`),
    ["get /memory", "patch /memory/:id"],
  );
});

test("disabled 插件不参与分发", async () => {
  const log: string[] = [];
  const registry = new PluginRegistry([
    { ...makePlugin("off", log), enabled: false },
    makePlugin("on", log),
  ]);
  await registry.initAll();
  await registry.dispatch("agent_end", { sessionId: "s1", cwd: "/tmp" });
  assert.deepEqual(log, ["init:on", "agent_end:on:s1"]);
});
