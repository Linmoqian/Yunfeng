// yunfeng-mobile 后端调试 CLI：配对、设备管理与远程桌面。
// Agent 对话请直接调用电脑侧 yunfeng-gateway 的 /api/tasks 接口。
// 用法：
//   node scripts/yf-cli.mjs health <baseUrl>
//   node scripts/yf-cli.mjs rotate <baseUrl>
//   node scripts/yf-cli.mjs pair <baseUrl> <code> [name]
//   node scripts/yf-cli.mjs devices <baseUrl> [token]
//   node scripts/yf-cli.mjs revoke <baseUrl> <token> <deviceId>
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
    if (a === "--fps") opts.fps = Number(argv[++i]);
    else if (a === "--frames") opts.frames = Number(argv[++i]);
    else if (a === "--save-dir") opts.saveDir = argv[++i];
    else if (a === "--token") opts.token = argv[++i];
  }
  return opts;
}

const [cmd, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => a.startsWith("--") === false);
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
    case "desktop": {
      const state = loadState();
      const token = opts.token ?? state?.token;
      if (args.length < 1 || !token) fail("用法: desktop <baseUrl>（token 读 ~/.yunfeng-mobile/client.json 或 --token）");
      await desktop(args[0], token, { fps: opts.fps ?? 2, frames: opts.frames ?? 3, saveDir: opts.saveDir });
      break;
    }
    default:
      fail("未知命令，支持: health / rotate / pair / devices / revoke / desktop");
  }
}

await main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
