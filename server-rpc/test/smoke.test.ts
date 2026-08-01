// B 方案冒烟测试：验证纯逻辑模块可用（会话列表/路径工具）。

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { sessionPathKey } from "../src/session-path.js";
import { listAllSessions, invalidateSessionListCache } from "../src/session-reader.js";

describe("session-path", () => {
  it("标准化 Windows 路径", () => {
    assert.equal(sessionPathKey("C:\\Project\\Foo"), "c:/project/foo");
  });
});

describe("session-reader", () => {
  it("列出与 pi CLI 共享的会话", async () => {
    invalidateSessionListCache();
    const sessions = await listAllSessions();
    assert.ok(Array.isArray(sessions));
    for (const s of sessions.slice(0, 5)) {
      assert.equal(typeof s.id, "string");
      if (s.path) assert.equal(existsSync(s.path), true);
    }
  });
});

describe("sdk 目录", () => {
  it("默认 agent 目录可访问", () => {
    assert.equal(existsSync(join(homedir(), ".pi", "agent")), true);
  });
});
