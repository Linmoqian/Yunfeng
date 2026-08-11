// sidecar 客户端集成测试：对 mock sidecar 校验协议解析与 SSE 订阅。

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { SidecarClient } from "../src/sidecar.ts";
import { MockSidecar } from "./mock-sidecar.ts";

describe("sidecar client", () => {
  test("health / startSession / sendCommand / destroySession", async () => {
    const mock = await MockSidecar.start();
    try {
      const client = new SidecarClient(mock.baseUrl, "test-token");
      assert.equal(await (await client.health()).ok, true);
      const started = await client.startSession({ cwd: "/tmp/proj", initialModel: { provider: "p", modelId: "m" } });
      assert.equal(started.sessionId, "s1");
      assert.equal(mock.started.length, 1);
      assert.equal(mock.started[0].cwd, "/tmp/proj");
      const data = await client.sendCommand<{ echo: unknown }>("s1", { type: "prompt", text: "hi" });
      assert.deepEqual(data.echo, { type: "prompt", text: "hi" });
      await client.destroySession("s1");
      assert.deepEqual(mock.destroyed, ["s1"]);
    } finally {
      await mock.close();
    }
  });

  test("subscribeEvents 转发事件并支持取消", async () => {
    const mock = await MockSidecar.start();
    try {
      const client = new SidecarClient(mock.baseUrl, "test-token");
      const events: unknown[] = [];
      let resolveUpdate: (v: unknown) => void;
      const update = new Promise((r) => {
        resolveUpdate = r;
      });
      const unsubscribe = client.subscribeEvents("s1", (event) => {
        events.push(event);
        if ((event as { type: string }).type === "message_update") resolveUpdate(event);
      });
      await sleep(50);
      mock.pushEvent("s1", { type: "message_update", text: "hello" });
      await update;
      assert.ok(events.some((e) => (e as { type: string }).type === "message_update"));
      unsubscribe();
      mock.pushEvent("s1", { type: "ignored" });
      await sleep(50);
      assert.equal(events.filter((e) => (e as { type: string }).type === "ignored").length, 0);
    } finally {
      await mock.close();
    }
  });

  test("错误 token 被拒", async () => {
    const mock = await MockSidecar.start();
    try {
      const client = new SidecarClient(mock.baseUrl, "wrong");
      await assert.rejects(() => client.health(), /unauthorized/);
    } finally {
      await mock.close();
    }
  });
});
