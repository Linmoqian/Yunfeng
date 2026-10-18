/* 固定工作流的单请求管道，完整往返计时由上层系统单调时钟覆盖。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { at, type Lane, type Request } from "./workflow-fixture.js";
export const binary = fileURLToPath(new URL("../../../app/src-tauri/research-kernel/target/release/yunfeng-research-kernel", import.meta.url));
export const nodeWorker = fileURLToPath(new URL("./native-worker.mjs", import.meta.url));
export type Reply = { value: any; innerMs?: number };
export type Target = { call: (request: Request) => Promise<Reply>; close: () => Promise<void> };
export async function target(lane: Lane, root: string, resume = false, hybridEnv?: NodeJS.ProcessEnv): Promise<Target> {
  if (lane === "nodeDirect") {
    const { fixtureHandler } = await import(new URL("./native-worker.mjs", import.meta.url).href);
    const handler = await fixtureHandler(root, { resume });
    return { call: async (request) => ({ value: await handler.call({ ...request, at }) }), close: async () => handler.close() };
  }
  const args = lane === "rustPipe" ? [root] : [nodeWorker, root];
  if (resume) args.push("--resume");
  if (lane === "hybridPipe") assert.equal(hybridEnv?.YUNFENG_RESEARCH_NATIVE, "1", "混合对照需要真实桌面私有通道");
  const env = { ...process.env };
  delete env.YUNFENG_RESEARCH_NATIVE;
  if (lane === "hybridPipe") Object.assign(env, hybridEnv);
  const child = spawn(lane === "rustPipe" ? binary : process.execPath, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  let pending: { resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
  let stderr = "";
  const next = () => new Promise<any>((resolve, reject) => { assert.equal(pending, undefined); pending = { resolve, reject }; });
  const fail = (error: Error) => { const waiter = pending; pending = undefined; waiter?.reject(error); };
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-4096); });
  child.on("error", fail);
  child.on("close", () => fail(new Error(`worker closed: ${stderr}`)));
  lines.on("line", (line) => {
    const waiter = pending; pending = undefined;
    try { waiter?.resolve(JSON.parse(line)); } catch { waiter?.reject(new Error("invalid JSON frame")); }
  });
  const timeout = () => setTimeout(() => { fail(new Error("worker timeout")); child.kill(); }, 10000);
  const startupDeadline = timeout();
  try { assert.deepEqual(await next(), { ready: true }); } catch (error) { child.kill(); throw error; } finally { clearTimeout(startupDeadline); }
  return { async call(request) {
    const response = next(), deadline = timeout();
    try {
      child.stdin.write(JSON.stringify({ ...request, at }) + "\n");
      const reply = await response;
      assert.equal(reply.ok, true, `worker rejected ${request.op}`);
      return { value: reply.value, innerMs: reply.innerMs };
    } finally { clearTimeout(deadline); }
  }, async close() {
    if (child.exitCode !== null || child.signalCode !== null) { lines.close(); return; }
    const closed = once(child, "close"), deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.stdin.end();
    try { await closed; } finally { clearTimeout(deadline); lines.close(); }
  } };
}
