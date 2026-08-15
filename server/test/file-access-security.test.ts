// 文件授权安全测试：符号链接不得把读取能力带到允许根之外。
// 平台不支持创建符号链接（如 Windows 权限受限）时，相关用例跳过。

import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isExistingFilePathAllowed } from "../src/file-access.js";

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
