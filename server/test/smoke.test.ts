// 冒烟测试：验证 server 核心逻辑模块可用（会话列表/文件授权/目录浏览）。
// 运行：node --test 或 tsx --test（需要真实会话数据，仅做存在性断言）。

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { isWindowsAbsolutePath, isFilePathAllowed } from "../src/file-access.js";
import { sessionPathKey } from "../src/session-path.js";
import { getParentDirectory, normalizeDirectory } from "../src/directory-browser.js";
import { listAllSessions, invalidateSessionListCache } from "../src/session-reader.js";

describe("session-path", () => {
  it("标准化 Windows 路径为小写正斜杠", () => {
    assert.equal(sessionPathKey("C:\\Project\\Foo"), "c:/project/foo");
    assert.equal(sessionPathKey("D:/project/Yunfeng"), "d:/project/yunfeng");
  });
});

describe("file-access", () => {
  it("识别 Windows 绝对路径", () => {
    assert.equal(isWindowsAbsolutePath("C:\\foo"), true);
    assert.equal(isWindowsAbsolutePath("\\\\server\\share"), true);
    assert.equal(isWindowsAbsolutePath("/home/user"), false);
  });

  it("授权判断基于前缀匹配", () => {
    const roots = new Set(["c:/project/yunfeng"]);
    assert.equal(isFilePathAllowed("C:\\project\\Yunfeng\\server", roots), true);
    assert.equal(isFilePathAllowed("C:\\project\\other", roots), false);
  });
});

describe("directory-browser", () => {
  it("父目录计算与归一化", () => {
    const parent = getParentDirectory("C:\\project\\Yunfeng");
    assert.equal(parent, "C:\\project");
    assert.equal(normalizeDirectory("~"), homedir());
  });
});

describe("session-reader", () => {
  it("列出与 pi CLI 共享的会话（存在性）", async () => {
    invalidateSessionListCache();
    const sessions = await listAllSessions();
    assert.ok(Array.isArray(sessions));
    for (const s of sessions.slice(0, 5)) {
      assert.equal(typeof s.id, "string");
      assert.equal(typeof s.path, "string");
      if (s.path) assert.equal(existsSync(s.path), true);
    }
  });
});

describe("sdk 会话目录", () => {
  it("默认 agent 目录可访问", () => {
    const agentDir = join(homedir(), ".pi", "agent");
    assert.equal(existsSync(agentDir), true);
  });
});
