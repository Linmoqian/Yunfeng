/* 共享 SDK 的 IPC 载荷、浏览器降级与结构化错误边界。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { componentSharing, sharingError } from "../src/features/workbench/services/componentSharing.ts";

test("共享 SDK 转发读写与窗口操作到 Rust", async () => {
  const previous = globalThis.window;
  const native = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
  globalThis.window = {} as Window & typeof globalThis;
  Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
  const calls: unknown[] = [];
  const snapshot = { component: "writing", revision: 1, state: { name: "示例", body: "正文" } };
  mockIPC((command, args) => { calls.push([command, args]); return command === "component_window" ? null : snapshot; });
  try {
    assert.deepEqual(await componentSharing.patch("writing", { body: "正文" }), snapshot);
    assert.deepEqual(await componentSharing.read("writing"), snapshot);
    await componentSharing.open("writing");
    await componentSharing.close("writing");
    assert.deepEqual(calls, [
      ["component_patch", { component: "writing", patch: { body: "正文" } }],
      ["component_read", { component: "writing" }],
      ["component_window", { component: "writing", open: true }],
      ["component_window", { component: "writing", open: false }],
    ]);
  } finally {
    clearMocks(); globalThis.window = previous;
    if (native) Object.defineProperty(globalThis, "isTauri", native);
    else Reflect.deleteProperty(globalThis, "isTauri");
  }
});
test("浏览器不伪造原生共享与窗口操作", async () => {
  await assert.rejects(componentSharing.open("writing"), /需要 Tauri 原生应用/);
  await assert.rejects(componentSharing.read("resources"), /需要 Tauri 原生应用/);
});
test("共享错误只展示已定义的结构化 IPC 信息", () => {
  assert.equal(sharingError({ code: "INVALID_STATE", message: "字段无效" }), "字段无效");
  assert.equal(sharingError("internal path"), "组件同步失败，请重试");
  assert.equal(sharingError({ code: "other", message: "internal path" }), "组件同步失败，请重试");
});
