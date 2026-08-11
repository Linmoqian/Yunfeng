// 后端集成测试：REST 配对/设备、WS 认证、rpc 桥接与事件转发、远程桌面帧与输入。

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createBackend, type Backend } from "../src/index.ts";
import type { Config } from "../src/types.ts";
import { MockSidecar } from "./mock-sidecar.ts";

type AnyMsg = Record<string, unknown>;

interface Conn {
  ws: WebSocket;
  buffer: AnyMsg[];
}

function makeConfig(sidecarUrl: string): Config {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath: ":memory:",
    sidecarUrl,
    sidecarToken: "test-token",
    fps: 10,
    pairTtlMs: 600_000,
  };
}

function httpJson(port: number, path: string, init?: RequestInit) {
  return fetch(`http://127.0.0.1:${port}${path}`, init).then(async (res) => ({
    status: res.status,
    body: (await res.json().catch(() => ({}))) as AnyMsg,
  }));
}

/** 连接即缓冲消息，避免服务端握手后立即发帧导致 open 后注册监听漏帧。 */
function connect(port: number, token?: string): Promise<Conn> {
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${q}`);
  const buffer: AnyMsg[] = [];
  ws.on("message", (data) => {
    buffer.push(JSON.parse(data.toString()) as AnyMsg);
  });
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, buffer }));
    ws.on("error", reject);
  });
}

function nextMessage(
  conn: Conn,
  predicate?: (m: AnyMsg) => boolean,
  timeoutMs = 2000,
): Promise<AnyMsg> {
  const { ws, buffer } = conn;
  const existing = buffer.find((m) => !predicate || predicate(m));
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting message"));
    }, timeoutMs);
    const onMsg = (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as AnyMsg;
      if (!predicate || predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMsg);
      ws.off("error", onErr);
    };
    ws.on("message", onMsg);
    ws.on("error", onErr);
  });
}

describe("backend integration", () => {
  let mock: MockSidecar;
  let backend: Backend;
  let port: number;
  const recordedInputs: unknown[] = [];

  before(async () => {
    mock = await MockSidecar.start();
    backend = createBackend(makeConfig(mock.baseUrl), {
      captureOnce: async () => Buffer.from("FAKEJPEG"),
      inputSender: async (input) => {
        recordedInputs.push(input);
      },
    });
    await new Promise<void>((resolve) => backend.server.listen(0, "127.0.0.1", resolve));
    port = (backend.server.address() as { port: number }).port;
  });

  after(async () => {
    await backend.close();
    await mock.close();
  });

  test("健康检查与配对码", async () => {
    backend.accounts.rotatePairing();
    const health = await httpJson(port, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal((health.body.pairing as { active: boolean }).active, true);
  });

  test("配对流程：错误码 400，正确码返回 token，设备列表可见", async () => {
    const pairing = backend.accounts.rotatePairing();
    const bad = await httpJson(port, "/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000000" }),
    });
    assert.equal(bad.status, 400);

    const ok = await httpJson(port, "/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairing.code, name: "iPhone" }),
    });
    assert.equal(ok.status, 200);
    const token = ok.body.token as string;
    assert.ok(token.length >= 32);

    const devices = await httpJson(port, "/api/devices", {
      headers: { "X-Device-Token": token },
    });
    assert.equal(devices.status, 200);
    assert.equal((devices.body.devices as unknown[]).length, 1);
    assert.equal((devices.body.devices as { name: string }[])[0].name, "iPhone");
  });

  test("WS 认证与 rpc 桥接、事件转发", async () => {
    const pairing = backend.accounts.rotatePairing();
    const pair = await httpJson(port, "/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairing.code }),
    });
    const token = pair.body.token as string;

    const conn = await connect(port, token);
    try {
      conn.ws.send(JSON.stringify({ type: "rpc.start", id: "r1", payload: { cwd: "/tmp/proj" } }));
      const ack = await nextMessage(conn, (m) => m.type === "rpc.response" && m.id === "r1");
      assert.equal(ack.ok, true);
      assert.equal((ack.data as { sessionId: string }).sessionId, "s1");
      assert.equal(mock.started.length, 1);
      // 等待 SSE 订阅建立（connected 事件到达即已注册），避免 pushEvent 竞态
      await nextMessage(
        conn,
        (m) => m.type === "rpc.event" && (m.event as { type: string }).type === "connected",
      );

      mock.pushEvent("s1", { type: "message_update", text: "hi" });
      const evt = await nextMessage(
        conn,
        (m) => m.type === "rpc.event" && (m.event as { type: string }).type === "message_update",
      );
      assert.equal((evt.event as { type: string }).type, "message_update");

      conn.ws.send(
        JSON.stringify({
          type: "rpc.command",
          id: "r2",
          sessionId: "s1",
          command: { type: "prompt", text: "你好" },
        }),
      );
      const cmdAck = await nextMessage(conn, (m) => m.type === "rpc.response" && m.id === "r2");
      assert.equal(cmdAck.ok, true);
      assert.deepEqual((cmdAck.data as { echo: unknown }).echo, {
        type: "prompt",
        text: "你好",
      });
    } finally {
      conn.ws.close();
    }
  });

  test("远程桌面：帧流与输入转发", async () => {
    const pairing = backend.accounts.rotatePairing();
    const pair = await httpJson(port, "/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairing.code }),
    });
    const token = pair.body.token as string;

    const conn = await connect(port, token);
    try {
      conn.ws.send(JSON.stringify({ type: "desktop.start", id: "d1", fps: 10 }));
      const ack = await nextMessage(conn, (m) => m.type === "rpc.response" && m.id === "d1");
      assert.equal(ack.ok, true);

      const frame = await nextMessage(conn, (m) => m.type === "desktop.frame");
      assert.equal(frame.mime, "image/jpeg");
      assert.equal(frame.data, Buffer.from("FAKEJPEG").toString("base64"));

      conn.ws.send(
        JSON.stringify({
          type: "desktop.input",
          id: "i1",
          input: { kind: "move", x: 10, y: 20 },
        }),
      );
      const inputAck = await nextMessage(conn, (m) => m.type === "rpc.response" && m.id === "i1");
      assert.equal(inputAck.ok, true);
      assert.equal(recordedInputs.length, 1);

      conn.ws.send(JSON.stringify({ type: "desktop.stop", id: "d2" }));
      const stopped = await nextMessage(conn, (m) => m.type === "desktop.stopped");
      assert.equal(stopped.reason, "client");
    } finally {
      conn.ws.close();
    }
  });

  test("无 token 连接被拒绝", async () => {
    const conn = await connect(port);
    const msg = await nextMessage(conn, () => true, 2000);
    assert.equal(msg.type, "error");
    assert.equal(msg.message, "unauthorized");
    conn.ws.close();
  });

  test("吊销设备后 token 失效", async () => {
    const pairing = backend.accounts.rotatePairing();
    const pair = await httpJson(port, "/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pairing.code }),
    });
    const token = pair.body.token as string;
    const deviceId = pair.body.deviceId as string;

    const del = await httpJson(port, `/api/devices/${deviceId}`, {
      method: "DELETE",
      headers: { "X-Device-Token": token },
    });
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);

    const conn = await connect(port, token).catch(() => null);
    if (conn) {
      const msg = await nextMessage(conn, () => true, 2000);
      assert.equal(msg.type, "error");
      assert.equal(msg.message, "unauthorized");
      conn.ws.close();
    }
  });
});
