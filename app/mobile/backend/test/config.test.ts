// 配置解析纯逻辑单测：默认值 / CLI 覆盖 / 环境变量覆盖。

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";

describe("config", () => {
  test("默认值", () => {
    const c = loadConfig([]);
    assert.equal(c.host, "0.0.0.0");
    assert.equal(c.port, 8788);
    assert.equal(c.fps, 2);
    assert.equal(c.pairTtlMs, 600_000);
    assert.ok(c.dbPath.endsWith("devices.db"));
  });

  test("CLI 参数优先", () => {
    const c = loadConfig([
      "--port",
      "9000",
      "--host",
      "127.0.0.1",
      "--fps",
      "5",
      "--pair-ttl-ms",
      "120000",
    ]);
    assert.equal(c.port, 9000);
    assert.equal(c.host, "127.0.0.1");
    assert.equal(c.fps, 5);
    assert.equal(c.pairTtlMs, 120000);
  });

  test("环境变量兜底", () => {
    const old = { ...process.env };
    process.env.YF_PORT = "9100";
    process.env.YF_FPS = "3";
    try {
      const c = loadConfig([]);
      assert.equal(c.port, 9100);
      assert.equal(c.fps, 3);
    } finally {
      for (const k of Object.keys(process.env)) {
        if (!(k in old)) delete process.env[k];
      }
      Object.assign(process.env, old);
    }
  });

  test("非法数字回退默认值", () => {
    const c = loadConfig(["--port", "abc"]);
    assert.equal(c.port, 8788);
  });
});
