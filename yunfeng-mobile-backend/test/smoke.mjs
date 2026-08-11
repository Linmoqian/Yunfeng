// 端到端冒烟：以真实入口启动后端，验证 READY 协议、配对、WS rpc 桥接与桌面帧。
// 用法：node test/smoke.mjs（需要能监听 127.0.0.1）

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 最小 sidecar mock
const mock = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.headers["x-pi-token"] !== "test-token") {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (url.pathname === "/api/rpc/start") {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sessionId: "s1", sessionFile: "/tmp/f.jsonl", cwd: "/tmp" }));
    });
    return;
  }
  if (url.pathname.startsWith("/api/rpc/") && url.pathname.endsWith("/events")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", sessionId: "s1" })}\n\n`);
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const mockPort = mock.address().port;

// 取一个空闲端口给后端
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const backendPort = probe.address().port;
await new Promise((resolve) => probe.close(resolve));

const backend = spawn(process.execPath, [
  "src/index.ts",
  "--host",
  "127.0.0.1",
  "--port",
  String(backendPort),
  "--db",
  ":memory:",
  "--sidecar-url",
  `http://127.0.0.1:${mockPort}`,
  "--sidecar-token",
  "test-token",
  "--fps",
  "10",
], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  backend.kill();
  mock.close();
  process.exit(1);
}

try {
  // 1) READY 协议
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting YF_MOBILE_READY")), 10_000);
    let buf = "";
    backend.stdout.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/YF_MOBILE_READY (\S+) (\d+) (\d{6}) (\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ host: m[1], port: Number(m[2]), code: m[3], expiresAt: m[4] });
      }
    });
    backend.on("exit", (code) => reject(new Error(`backend exited early: ${code}`)));
  });
  if (ready.port !== backendPort || !/^\d{6}$/.test(ready.code)) {
    fail(`READY 行异常: ${JSON.stringify(ready)}`);
  }
  console.log(`[smoke] READY ok: port=${ready.port} code=${ready.code}`);

  // 2) 配对
  const pairRes = await fetch(`http://127.0.0.1:${ready.port}/api/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: ready.code }),
  });
  const pair = await pairRes.json();
  if (!pair.token) fail(`配对失败: ${JSON.stringify(pair)}`);
  console.log("[smoke] pair ok");

  // 3) WS rpc 桥接
  const ws = new WebSocket(`ws://127.0.0.1:${ready.port}/ws?token=${pair.token}`);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  const ack = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout rpc ack")), 5000);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "rpc.response" && msg.id === "r1") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.send(JSON.stringify({ type: "rpc.start", id: "r1", payload: { cwd: "/tmp" } }));
  });
  if (!ack.ok || ack.data.sessionId !== "s1") fail(`rpc.start 异常: ${JSON.stringify(ack)}`);
  console.log("[smoke] rpc.start ok");

  // 4) 桌面帧（后端捕获源在 darwin 为 screencapture，这里仅验证启动响应；帧依赖屏幕录制权限）
  const frameAck = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout desktop ack")), 5000);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "rpc.response" && msg.id === "d1") {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.send(JSON.stringify({ type: "desktop.start", id: "d1", fps: 10 }));
  });
  if (!frameAck.ok) fail(`desktop.start 异常: ${JSON.stringify(frameAck)}`);
  console.log("[smoke] desktop.start ok");

  ws.close();
  console.log("[smoke] PASS");
  backend.kill();
  mock.close();
  process.exit(0);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
