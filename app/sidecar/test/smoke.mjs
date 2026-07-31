// 临时集成测试：启动 sidecar 子进程，验证 health/sessions/models/fs 接口。
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const BUN = String.raw`C:\Users\30470\AppData\Roaming\npm\node_modules\bun\bin\bun.exe`;
const CWD = String.raw`D:\project\Yunfeng\app\sidecar`;
const token = randomBytes(12).toString("hex");

const child = spawn(BUN, ["run", "src/index.ts", "--port", "0", "--token", token], {
  cwd: CWD,
  stdio: ["ignore", "pipe", "pipe"],
});

let buf = "";
let port;
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("ready timeout")), 15000);
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    for (const line of buf.split("\n")) {
      const m = line.match(/PI_SIDECAR_READY (\d+) (\S+)/);
      if (m) {
        port = Number(m[1]);
        clearTimeout(timer);
        resolve(port);
      }
    }
  });
  child.stderr.on("data", (c) => process.stderr.write("[stderr] " + c));
  child.on("exit", (code) => {
    if (port == null) reject(new Error("exited before ready, code=" + code));
  });
});

async function api(path, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...opts,
    headers: { "X-Pi-Token": token, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => res.text()) };
}

try {
  await ready;
  console.log("port =", port);

  const health = await api("/api/health");
  console.log("health:", JSON.stringify(health));

  const sessions = await api("/api/sessions");
  console.log("sessions status:", sessions.status, "count:", Array.isArray(sessions.body.sessions) ? sessions.body.sessions.length : "n/a");
  if (Array.isArray(sessions.body.sessions) && sessions.body.sessions[0]) {
    console.log("first session:", JSON.stringify(sessions.body.sessions[0]).slice(0, 200));
  }

  const models = await api("/api/models");
  console.log("models status:", models.status);
  console.log("providers:", (models.body.providers || []).map((p) => `${p.id}(${p.configured ? "✓" : "✗"})`).join(", "));
  console.log("available count:", (models.body.available || []).length);

  const fslist = await api(`/api/fs/list?root=${encodeURIComponent(CWD)}&path=src`);
  console.log("fs/list src:", fslist.status, (fslist.body.entries || []).map((e) => e.name).join(", "));

  const fsread = await api(`/api/fs/read?root=${encodeURIComponent(CWD)}&path=src/types.ts`);
  console.log("fs/read types.ts:", fsread.status, "len:", (fsread.body.content || "").length);

  // 非法 token
  const bad = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { "X-Pi-Token": "wrong" } });
  console.log("bad token status:", bad.status);

  console.log("\nALL OK");
} catch (e) {
  console.error("TEST FAILED:", e);
  process.exitCode = 1;
} finally {
  child.kill();
}
