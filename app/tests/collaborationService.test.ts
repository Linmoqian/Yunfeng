/* 验证协作 IPC 载荷与失败反馈，不依赖真实窗口或数据库。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { collaborationAction, collaborationError } from "../src/features/workbench/services/collaborationService.ts";

test("协作入口将操作交给 Rust 并返回原生快照", async () => {
  const previous = globalThis.window;
  globalThis.window = {} as Window & typeof globalThis;
  const snapshot = { mode: "empty", installationId: "test-installation", team: null, savedTeams: [], messages: [], board: "", links: [], networkAvailable: false };
  mockIPC((command, args) => {
    assert.equal(command, "collaboration_action");
    assert.deepEqual(args, { input: { action: "create", name: "团队", owner: "工程师" } });
    return snapshot;
  });
  try { assert.deepEqual(await collaborationAction({ action: "create", name: "团队", owner: "工程师" }), snapshot); }
  finally { clearMocks(); globalThis.window = previous; }
});
test("只显示结构化协作错误，不暴露原始 IPC 内容", () => {
  assert.equal(collaborationError({ code: "COLLAB_INPUT", message: "名称无效" }), "名称无效");
  assert.equal(collaborationError("raw internal failure"), "协作服务调用失败，请在桌面应用中重试");
  assert.equal(collaborationError({ code: "COLLAB_CANCELLED", message: "已取消连接" }), "");
  assert.equal(collaborationError({ code: "NODE_FORBIDDEN", message: "节点认证或团队授权失败" }), "节点认证或团队授权失败");
  assert.equal(collaborationError(new Error("internal path")), "协作服务调用失败，请在桌面应用中重试");
});
