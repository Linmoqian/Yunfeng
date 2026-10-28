// 校验发布版 Node 发行包的平台选择与完整性拒绝路径。
// Created on 2026-10-28
// @author: https://github.com/Linmoqian

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { nodeRelease, stageNodeRuntime, verifyNodeArchive } from "../node-runtime.mjs";

test("Node 发行包与目标平台对应，未知平台拒绝", () => {
  assert.equal(nodeRelease("darwin", "arm64").archive, "node-v22.23.4-darwin-arm64.tar.gz");
  assert.equal(nodeRelease("win32", "x64").executable, "node.exe");
  assert.throws(() => nodeRelease("linux", "s390x"), /不支持/);
});

test("发行包哈希不匹配时拒绝", () => {
  const data = Buffer.from("fixture");
  const hash = createHash("sha256").update(data).digest("hex");
  assert.doesNotThrow(() => verifyNodeArchive(data, hash));
  assert.throws(() => verifyNodeArchive(data, "0".repeat(64)), /校验失败/);
});

test("错误发行包不会创建运行时目录", () => {
  const root = mkdtempSync(join(tmpdir(), "yunfeng-node-test-"));
  try {
    const archive = join(root, "node.tar.gz");
    const destination = join(root, "runtime");
    writeFileSync(archive, "invalid");
    assert.throws(() => stageNodeRuntime(archive, destination, "darwin", "arm64"), /校验失败/);
    assert.equal(existsSync(destination), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
