// 端到端冒烟：以真实入口启动移动后端，验证 READY 协议、配对、WS 认证与远程桌面启动应答。
// 用法：node test/smoke.mjs（需要能监听 127.0.0.1）

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 取一个空闲端口给后端
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const backendPort = probe.address().port;
await new Promise((resolve) => probe.close(resolve));

const backend = spawn(
  process.execPath,
  ["src/index.ts", "--host", "127.0.0.1", "--port", String(backendPort), "--db", ":memory:", "--fps", "10"],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
);

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  backend.kill();
  process.exit(1);
}

function jsonMessage(ws, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timeout waiting message"));
    }, timeoutMs);
    const onMsg = (data) => {
      const msg = JSON.parse(data.toString());
      if (!predicate || predicate(msg)) {
        cleanup();
        resolve(msg);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMsg);
    };
    ws.on("message", onMsg);
  });
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
    body: JSON.stringify({ code: ready.code, name: "smoke" }),
  });
  const pair = await pairRes.json();
  if (!pair.token) fail(`配对失败: ${JSON.stringify(pair)}`);
  console.log("[smoke] pair ok");

  // 3) WS 认证与远程桌面启动应答
  const ws = new WebSocket(`ws://127.0.0.1:${ready.port}/ws?token=${pair.token}`);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  ws.send(JSON.stringify({ type: "desktop.start", id: "d1", fps: 10 }));
  const ack = await jsonMessage(ws, (m) => m.type === "rpc.response" && m.id === "d1", 5000);
  if (!ack.ok) fail(`desktop.start 异常: ${JSON.stringify(ack)}`);
  console.log("[smoke] desktop.start ok");

  ws.close();
  console.log("[smoke] PASS");
  backend.kill();
  process.exit(0);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
