/* 验证实际 HTTP 路由优先级，避免保留路径被会话参数吞掉。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("Agent 运行列表与事件路由先于通用会话路由", { timeout: 20_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "yunfeng-http-"));
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const address = portProbe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => portProbe.close(() => resolve()));
  const env = { ...process.env, HOME: home, USERPROFILE: home, YUNFENG_RUNTIME_HOME: home };
  for (const key of ["YUNFENG_AGENT_DIR", "YUNFENG_DATA_DIR", "LIN_CODING_AGENT_DIR", "LIN_CODING_AGENT_SESSION_DIR"]) delete (env as NodeJS.ProcessEnv)[key];
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "--port", String(address.port)], {
    cwd: new URL("../", import.meta.url), env, stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server 启动超时")), 10_000);
      child.once("error", reject);
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("Server 提前退出")); });
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("PI_SERVER_READY")) { clearTimeout(timeout); resolve(); }
      });
    });
    const base = `http://127.0.0.1:${address.port}`;
    const running = await fetch(`${base}/api/agent/running`);
    assert.equal(running.status, 200);
    assert.deepEqual(await running.json(), { runningSessionIds: [] });
    const session = await fetch(`${base}/api/agent/missing-session`);
    assert.deepEqual(await session.json(), { running: false });
    const controller = new AbortController();
    try {
      const events = await fetch(`${base}/api/agent/running/events`, { signal: controller.signal });
      assert.equal(events.status, 200);
      assert.match(events.headers.get("content-type") ?? "", /text\/event-stream/);
      const first = await events.body?.getReader().read();
      assert.match(new TextDecoder().decode(first?.value), /"runningSessionIds":\[\]/);
    } finally { controller.abort(); }
  } finally {
    child.kill("SIGTERM");
    await exited;
    rmSync(home, { recursive: true, force: true });
  }
});
