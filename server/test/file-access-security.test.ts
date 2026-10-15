// 文件授权安全测试：符号链接不得把读取能力带到允许根之外。
// 平台不支持创建符号链接（如 Windows 权限受限）时，相关用例跳过。
// Created on 2026-10-15
// @author: https://github.com/Linmoqian

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllowedFileRoots, isExistingFilePathAllowed, isFilePathAllowed, isWindowsAbsolutePath } from "../src/file-access.js";
import { sessionPathKey } from "../src/session-path.js";
import { createTaskContextForDataDir } from "../src/task/task-context.js";

test("科研任务目录不依赖 Pi 会话，创建和归档立即更新权限且链接不能越界", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "yf-research-access-"));
  const context = createTaskContextForDataDir(path.join(root, "data"));
  const previous = globalThis.__yfContext, cache = globalThis.__piAllowedRootsCache;
  globalThis.__yfContext = context;
  globalThis.__piAllowedRootsCache = { roots: new Set(), expiresAt: Date.now() + 5000 };
  try {
    assert.equal(isFilePathAllowed(root, await getAllowedFileRoots()), false);
    const task = context.store.create({ sessionId: "research-access", cwd: root, title: "科研", source: "task" });
    context.store.update(task.id, (s) => { s.mode = "research"; });
    const roots = await getAllowedFileRoots();
    assert.equal(isExistingFilePathAllowed(root, roots), true);
    const outside = path.dirname(root);
    if (createSymlink(outside, path.join(root, "outside"))) assert.equal(isExistingFilePathAllowed(path.join(root, "outside"), roots), false);
    context.store.update(task.id, (s) => { s.status = "archived"; });
    assert.equal(isFilePathAllowed(root, await getAllowedFileRoots()), false);
  } finally {
    globalThis.__yfContext = previous; globalThis.__piAllowedRootsCache = cache;
    rmSync(root, { recursive: true, force: true });
  }
});

test("Windows 路径规范化后仍限制在允许根内", () => {
  assert.equal(sessionPathKey("C:\\Project\\Foo"), "c:/project/foo");
  assert.equal(isWindowsAbsolutePath("C:\\foo"), true);
  assert.equal(isWindowsAbsolutePath("\\\\server\\share"), true);
  assert.equal(isWindowsAbsolutePath("/home/user"), false);
  const roots = new Set(["c:/project/yunfeng"]);
  assert.equal(isFilePathAllowed("C:\\project\\Yunfeng\\server", roots), true);
  assert.equal(isFilePathAllowed("C:\\project\\yunfeng-other", roots), false);
});

function tempRoot(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function createSymlink(target: string, linkPath: string): boolean {
  try {
    symlinkSync(target, linkPath);
    return true;
  } catch {
    return false;
  }
}

test("允许根内的普通文件可访问", () => {
  const root = tempRoot("yf-file-allow-");
  try {
    const file = path.join(root, "readme.txt");
    writeFileSync(file, "hello");
    assert.equal(isExistingFilePathAllowed(file, new Set([root])), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("允许根内指向根外的符号链接被拒绝", (t) => {
  const root = tempRoot("yf-file-root-");
  const outside = tempRoot("yf-file-outside-");
  try {
    const secret = path.join(outside, "secret.txt");
    writeFileSync(secret, "secret");
    const link = path.join(root, "leak.txt");
    if (!createSymlink(secret, link)) {
      t.skip("当前平台无法创建符号链接");
      return;
    }
    assert.equal(isExistingFilePathAllowed(link, new Set([root])), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("允许根内不存在的路径保留词法通过（由 stat 层返回 404）", () => {
  const root = tempRoot("yf-file-missing-");
  try {
    const missing = path.join(root, "not-there.txt");
    assert.equal(isExistingFilePathAllowed(missing, new Set([root])), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("允许根本身是符号链接时真实目标仍可访问", (t) => {
  const parent = tempRoot("yf-file-linkroot-");
  const realRoot = tempRoot("yf-file-realroot-");
  try {
    const linkRoot = path.join(parent, "linked-root");
    if (!createSymlink(realRoot, linkRoot)) {
      t.skip("当前平台无法创建符号链接");
      return;
    }
    const file = path.join(linkRoot, "inside.txt");
    writeFileSync(file, "inside");
    assert.equal(isExistingFilePathAllowed(file, new Set([linkRoot])), true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
    rmSync(realRoot, { recursive: true, force: true });
  }
});
