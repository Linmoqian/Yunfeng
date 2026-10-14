/* 开发进程归属：仅匹配本仓库原生二进制，保留安装版和独立预览。
 * Created on 2026-10-14
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { kindOf } from "../scripts/dev/processes.mjs";

const root = resolve(import.meta.dirname, "..");
test("开发应用匹配包含空格的本仓库应用包", () => {
  assert.equal(kindOf({ command: `${root}/src-tauri/target/debug/dev-bundle/Yunfeng 开发.app/Contents/MacOS/yunfeng-desktop` }), "app");
  assert.equal(kindOf({ command: `${root}/src-tauri/target/debug/yunfeng-desktop` }), "app");
});
test("安装版、其他项目和无关进程不进入原生清理", () => {
  for (const command of ["/Applications/Yunfeng.app/Contents/MacOS/yunfeng-desktop", "/tmp/other/src-tauri/target/debug/yunfeng-desktop", "node something.mjs"])
    assert.equal(kindOf({ command }), undefined);
});
test("独立共享与预览 Vite 被保留", () => {
  assert.equal(kindOf({ command: "node /packages/vite/bin/vite.js" }), "vite");
  assert.equal(kindOf({ command: "node /packages/vite/bin/vite.js --mode web-shared" }), undefined);
  assert.equal(kindOf({ command: "node /packages/vite/bin/vite.js --mode=preview-native" }), undefined);
});
