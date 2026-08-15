// 配置解析测试：默认值、CLI/环境变量优先级、非法上游。

import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";

test("默认配置监听 0.0.0.0:8787 并生成随机 token", () => {
  const config = loadConfig([], {});
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 8787);
  assert.equal(config.upstream, "http://127.0.0.1:8000");
  assert.equal(config.allowAll, false);
  assert.equal(config.corsOrigin, "*");
  assert.ok(config.authToken.length >= 20);
});

test("CLI 参数优先于环境变量", () => {
  const config = loadConfig(
    ["--host", "127.0.0.1", "--port", "9000", "--upstream", "http://127.0.0.1:9001/", "--auth-token", "cli-token", "--allow-all"],
    {
      YUNFENG_GATEWAY_HOST: "0.0.0.0",
      YUNFENG_GATEWAY_PORT: "8787",
      YUNFENG_GATEWAY_UPSTREAM: "http://127.0.0.1:8000",
      YUNFENG_GATEWAY_TOKEN: "env-token",
      YUNFENG_GATEWAY_ALLOW_ALL: "false",
    },
  );
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 9000);
  assert.equal(config.upstream, "http://127.0.0.1:9001");
  assert.equal(config.authToken, "cli-token");
  assert.equal(config.allowAll, true);
});

test("环境变量可作为唯一配置来源", () => {
  const config = loadConfig([], {
    YUNFENG_GATEWAY_HOST: "192.168.1.10",
    YUNFENG_GATEWAY_PORT: "8790",
    YUNFENG_GATEWAY_UPSTREAM: "http://127.0.0.1:8000",
    YUNFENG_GATEWAY_TOKEN: "env-token",
    YUNFENG_GATEWAY_CORS_ORIGIN: "http://localhost:1420",
  });
  assert.equal(config.host, "192.168.1.10");
  assert.equal(config.port, 8790);
  assert.equal(config.authToken, "env-token");
  assert.equal(config.corsOrigin, "http://localhost:1420");
});

test("非法端口回退默认值", () => {
  const config = loadConfig(["--port", "abc"], {});
  assert.equal(config.port, 8787);
});

test("非法上游协议抛出错误", () => {
  assert.throws(() => loadConfig(["--upstream", "ftp://127.0.0.1"], {}), /仅支持 http\/https/);
  assert.throws(() => loadConfig(["--upstream", "http://user:pass@127.0.0.1:8000"], {}), /账号信息/);
});
