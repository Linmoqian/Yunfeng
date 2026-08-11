// yunfeng-mobile 后端调试 CLI：以移动端同款协议（REST 配对 + WS 实时通道）与服务端通讯。
// 用法：
//   node scripts/yf-cli.mjs health <baseUrl>
//   node scripts/yf-cli.mjs rotate <baseUrl>
//   node scripts/yf-cli.mjs pair <baseUrl> <code> [name]
//   node scripts/yf-cli.mjs devices <baseUrl> [token]
//   node scripts/yf-cli.mjs revoke <baseUrl> <token> <deviceId>
//   node scripts/yf-cli.mjs chat <baseUrl> "<text>" [--cwd /path] [--timeout 20] [--token xxx]
//   node scripts/yf-cli.mjs desktop <baseUrl> [--fps 2] [--frames 3] [--save-dir dir] [--token xxx]

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { WebSocket } = require("ws");

const STATE_PATH = join(homedir(), ".yunfeng-mobile", "client.json");

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveState(state) {
  mkdirSync(join(homedir(), ".yunfeng-mobile"), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function normalize(baseUrl) {
  return baseUrl.replace(/\/+$/, "");
}

function fail(msg) {
  console.error(`[yf-cli] ${msg}`);
  process.exit(1);
}

function jsonRequest(baseUrl, path, init) {
  return fetch(`${normalize(baseUrl)}${path}`, init).then(async (res) => ({
    status: res.status,
    body: await res.json().catch(() => ({})),
  }));
}

function connectWs(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${normalize(baseUrl)}/ws?token=${encodeURIComponent(token)}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function nextMessage(ws, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("等待消息超时"));
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

async function health(baseUrl) {
  const res = await jsonRequest(baseUrl, "/health");
  if (res.status !== 200) fail(`health 失败: ${JSON.stringify(res.body)}`);
  const pairing = res.body.pairing;
  console.log(`ok: true  version: ${res.body.version}`);
  console.log(`配对码: ${pairing.active ? `有效（剩余 ${pairing.expiresIn}s）` : "无"}`);
}

async function rotate(baseUrl) {
  const res = await jsonRequest(baseUrl, "/api/pairing/rotate", { method: "POST" });
  if (res.status !== 200 || !res.body.code) fail(`轮换失败: ${JSON.stringify(res.body)}`);
  console.log(`新配对码: ${res.body.code}（有效至 ${new Date(res.body.expiresAt).toISOString()}）`);
}

async function pair(baseUrl, code, name) {
  const res = await jsonRequest(baseUrl, "/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name: name ?? "yf-cli" }),
  });
  if (res.status !== 200 || !res.body.token) {
    fail(`配对失败: ${JSON.stringify(res.body)}`);
  }
  const state = { baseUrl: normalize(baseUrl), deviceId: res.body.deviceId, token: res.body.token };
  saveState(state);
  console.log(`配对成功  deviceId=${state.deviceId}  token 已保存到 ${STATE_PATH}`);
}

async function devices(baseUrl, token) {
  const res = await jsonRequest(baseUrl, "/api/devices", {
    headers: { "X-Device-Token": token },
  });
  if (res.status !== 200) fail(`获取设备失败: ${JSON.stringify(res.body)}`);
  for (const d of res.body.devices ?? []) {
    console.log(`${d.id}  ${d.name}  created=${new Date(d.createdAt).toISOString()}`);
  }
}

async function revoke(baseUrl, token, deviceId) {
  const res = await jsonRequest(baseUrl, `/api/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    headers: { "X-Device-Token": token },
  });
  if (res.status !== 200) fail(`吊销失败: ${JSON.stringify(res.body)}`);
  console.log(`已吊销 ${deviceId}`);
}

async function chat(baseUrl, token, text, opts) {
  const ws = await connectWs(baseUrl, token);
  const timeout = opts.timeout * 1000;
  try {
    console.log(`已连接 ${normalize(baseUrl)}/ws`);
    ws.send(JSON.stringify({ type: "rpc.start", id: "start", payload: { cwd: opts.cwd } }));
    const ack = await nextMessage(ws, (m) => m.type === "rpc.response" && m.id === "start", timeout);
    if (!ack.ok) fail(`启动会话失败: ${ack.error}`);
    const sessionId = ack.data.sessionId;
    console.log(`会话已启动 sessionId=${sessionId}，发送指令：${text}`);

    ws.send(
      JSON.stringify({ type: "rpc.command", id: "cmd", sessionId, command: { type: "prompt", text } }),
    );
    let done = false;
    const deadline = setTimeout(() => {
      done = true;
      console.error("[yf-cli] 超时未收到完成事件");
      process.exitCode = 2;
      ws.close();
    }, timeout);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "rpc.event") {
        const evt = msg.event;
        if (evt.type === "message_update" && typeof evt.text === "string") {
          process.stdout.write(evt.text);
        } else if (evt.type === "message_complete" || evt.type === "session_completed" || evt.type === "done") {
          if (!done) {
            done = true;
            clearTimeout(deadline);
            console.log("\n[完成]");
            ws.close();
          }
        } else if (evt.type !== "connected") {
          console.log(`\n[事件] ${evt.type}`);
        }
      } else if (msg.type === "error") {
        console.error(`\n[错误] ${msg.message}`);
        done = true;
        clearTimeout(deadline);
        process.exitCode = 1;
        ws.close();
      }
    });
    await new Promise((resolve) => ws.on("close", resolve));
  } finally {
    ws.close();
  }
}

async function desktop(baseUrl, token, opts) {
  const ws = await connectWs(baseUrl, token);
  const frames = opts.frames;
  const saveDir = opts.saveDir;
  if (saveDir) mkdirSync(saveDir, { recursive: true });
  console.log(`已连接，请求远程桌面 fps=${opts.fps}，采集 ${frames} 帧`);
  ws.send(JSON.stringify({ type: "desktop.start", id: "dstart", fps: opts.fps }));
  const ack = await nextMessage(ws, (m) => m.type === "rpc.response" && m.id === "dstart", 8000);
  if (!ack.ok) fail(`启动远程桌面失败: ${ack.error}`);

  let received = 0;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("采集帧超时")), 30_000);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "desktop.frame") {
        const bytes = Buffer.from(msg.data, "base64").length;
        console.log(`frame ${msg.seq}  ${msg.mime}  ${bytes} bytes`);
        if (saveDir) {
          const ext = msg.mime.includes("png") ? "png" : "jpg";
          writeFileSync(join(saveDir, `frame-${String(msg.seq).padStart(3, "0")}.${ext}`), Buffer.from(msg.data, "base64"));
        }
        received += 1;
        if (received >= frames) {
          clearTimeout(timer);
          ws.send(JSON.stringify({ type: "desktop.stop", id: "dstop" }));
          setTimeout(resolve, 300);
        }
      } else if (msg.type === "error") {
        clearTimeout(timer);
        reject(new Error(msg.message));
      }
    });
  });
  console.log(`已采集 ${received} 帧${saveDir ? `，保存到 ${saveDir}` : ""}`);
  ws.close();
}

function parseFlags(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--cwd") opts.cwd = argv[++i];
    else if (a === "--timeout") opts.timeout = Number(argv[++i]);
    else if (a === "--fps") opts.fps = Number(argv[++i]);
    else if (a === "--frames") opts.frames = Number(argv[++i]);
    else if (a === "--save-dir") opts.saveDir = argv[++i];
    else if (a === "--token") opts.token = argv[++i];
  }
  return opts;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => !a.startsWith("--"));
const opts = parseFlags(rest);

async function main() {
  switch (cmd) {
    case "health":
      if (args.length < 1) fail("用法: health <baseUrl>");
      await health(args[0]);
      break;
    case "rotate":
      if (args.length < 1) fail("用法: rotate <baseUrl>");
      await rotate(args[0]);
      break;
    case "pair":
      if (args.length < 2) fail("用法: pair <baseUrl> <code> [name]");
      await pair(args[0], args[1], args[2]);
      break;
    case "devices": {
      const state = loadState();
      const token = args[1] ?? state?.token;
      if (args.length < 1 || !token) fail("用法: devices <baseUrl> [token]（token 缺省读 ~/.yunfeng-mobile/client.json）");
      await devices(args[0], token);
      break;
    }
    case "revoke": {
      const state = loadState();
      const token = args[1] ?? state?.token;
      if (args.length < 3 || !token) fail("用法: revoke <baseUrl> <token> <deviceId>");
      await revoke(args[0], token, args[2]);
      break;
    }
    case "chat": {
      const state = loadState();
      const token = opts.token ?? state?.token;
      if (args.length < 2 || !token) fail("用法: chat <baseUrl> \"<text>\"（token 读 ~/.yunfeng-mobile/client.json 或 --token）");
      await chat(args[0], token, args[1], { cwd: opts.cwd ?? "/", timeout: opts.timeout ?? 20 });
      break;
    }
    case "desktop": {
      const state = loadState();
      const token = opts.token ?? state?.token;
      if (args.length < 1 || !token) fail("用法: desktop <baseUrl>（token 读 ~/.yunfeng-mobile/client.json 或 --token）");
      await desktop(args[0], token, { fps: opts.fps ?? 2, frames: opts.frames ?? 3, saveDir: opts.saveDir });
      break;
    }
    default:
      fail("未知命令，支持: health / rotate / pair / devices / revoke / chat / desktop");
  }
}

await main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
