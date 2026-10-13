/* 桌面标题栏的平台分支回归。
 * Created on 2026-10-13
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveWindowPlatform } from "../src/components/titlebar/windowPlatform.ts";

test("浏览器预览不显示原生控制，桌面按平台选择标题栏", () => {
  assert.equal(resolveWindowPlatform(false, "Macintosh"), "browser");
  assert.equal(resolveWindowPlatform(true, "Macintosh; Intel Mac OS X"), "macos");
  assert.equal(resolveWindowPlatform(true, "Windows NT 10.0"), "windows");
  assert.equal(resolveWindowPlatform(true, "X11; Linux x86_64"), "linux");
});
