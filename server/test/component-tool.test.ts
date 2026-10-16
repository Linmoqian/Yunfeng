/* 组件 SDK、工具摘要和失败边界；实际渲染通过原生应用验收。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { applicationComponents, componentClient } from "../src/agent/component-client.js";
import { nativeComponentTools } from "../src/agent/component-tool.js";

test("组件 SDK 使用桌面通道，工具打开并更新只返回简短摘要", async () => {
  const requests: unknown[] = [];
  const snapshot = { component: "resources", revision: 3, state: { view: "结果", files: [] } };
  const server = createServer(socket => socket.once("data", bytes => {
    const envelope = JSON.parse(bytes.toString());
    assert.equal(envelope.token, "test-only");
    requests.push(envelope.request);
    socket.end(JSON.stringify({ result: envelope.request.request.action === "close" ? null : ["focus", "blur"].includes(envelope.request.request.action) ? { component: "resources", revision: 4, target: envelope.request.request.action === "focus" ? "files" : null } : snapshot }) + "\n");
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const client = applicationComponents({ YUNFENG_APP_PORT: String(address.port), YUNFENG_APP_TOKEN: "test-only" })!;
    const tool = nativeComponentTools(client)[0];
    const args = validateToolArguments(tool, { type: "toolCall", id: "open", name: tool.name, arguments: { action: "open", component: "resources", patch: { view: "结果" } } });
    const result = await tool.execute("open", args, undefined, undefined, {} as never);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(result.details, { component: "resources", action: "open", revision: 3 });
    assert.ok(!JSON.stringify(result).includes('"files"'));
    assert.deepEqual(await client.read("resources"), snapshot);
    assert.deepEqual(await client.patch("resources", { view: "文件" }), snapshot);
    const focused = await tool.execute("focus", { action: "focus", component: "resources", target: "files" }, undefined, undefined, {} as never);
    assert.deepEqual(focused.details, { component: "resources", action: "focus", revision: 4, target: "files" });
    assert.deepEqual(await client.blur("resources"), { component: "resources", revision: 4, target: null });
    await client.close("resources");
    assert.deepEqual(requests, [
      { action: "component", request: { action: "open", component: "resources", patch: { view: "结果" } } },
      { action: "component", request: { action: "read", component: "resources" } },
      { action: "component", request: { action: "patch", component: "resources", patch: { view: "文件" } } },
      { action: "component", request: { action: "focus", component: "resources", target: "files" } },
      { action: "component", request: { action: "blur", component: "resources" } },
      { action: "component", request: { action: "close", component: "resources" } },
    ]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("组件工具在取消和非法请求时不调用桌面，未连接时不伪造可用能力", async () => {
  assert.equal(applicationComponents({}), undefined);
  assert.throws(() => applicationComponents({ YUNFENG_APP_PORT: "0", YUNFENG_APP_TOKEN: "test-only" }), /配置无效/);
  let called = false;
  const client = componentClient(async <T>() => { called = true; return null as T; });
  const tool = nativeComponentTools(client)[0];
  for (const args of [
    { action: "patch", component: "writing" },
    { action: "read", component: "writing", patch: {} },
    { action: "focus", component: "writing", patch: {} },
  ]) await assert.rejects(tool.execute("invalid", args, undefined, undefined, {} as never), /patch 字段/);
  await assert.rejects(tool.execute("invalid", { action: "read", component: "writing", target: "body" }, undefined, undefined, {} as never), /target 字段/);
  await assert.rejects(tool.execute("cancelled", { action: "open", component: "resources" }, AbortSignal.abort(), undefined, {} as never), /取消/);
  assert.throws(() => validateToolArguments(tool, { type: "toolCall", id: "invalid", name: tool.name, arguments: { action: "eval", component: "unknown" } }));
  assert.equal(called, false);
});
