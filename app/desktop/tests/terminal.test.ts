/* 终端 SDK 的原生边界、错误过滤与迁移契约。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { terminalApi, terminalError } from "../src/features/workbench/services/terminal.ts";

test("浏览器不伪造终端执行，未知错误不泄露底层内容", async () => {
  await assert.rejects(terminalApi.start({ cols: 80, rows: 24 }), /Tauri 原生应用/);
  assert.equal(terminalError({ code: "LIMIT", message: "最多四个终端" }), "最多四个终端");
  assert.equal(terminalError({ code: "PRIVATE", message: "secret" }), "终端操作失败，请重试");
});
test("PTY 权限仅授予主窗口", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const main = JSON.parse(source("../src-tauri/capabilities/default.json"));
  const children = JSON.parse(source("../src-tauri/capabilities/components.json"));
  assert.ok(main.permissions.includes("allow-terminal-action"));
  assert.ok(!children.permissions.includes("allow-terminal-action"));
});
