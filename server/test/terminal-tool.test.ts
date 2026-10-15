/* TypeScript 终端工具的输出、取消、超时与连接失效核心回归。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { terminalConnection, type TerminalCall, type TerminalRequest } from "../src/agent/terminal-client.js";
import { terminalOperations } from "../src/agent/terminal-tool.js";

function fake(handler: (request: TerminalRequest) => unknown): TerminalCall {
  return async <T>(request: TerminalRequest) => handler(request) as T;
}
test("同一 PTY 的输出分块返回，保留非零退出码，不把已发送当作完成", async () => {
  const actions: string[] = [];
  let reads = 0;
  const call = fake((request) => {
    actions.push(request.action);
    if (request.action === "start") return { id: "pty" };
    if (request.action === "read") return reads++ === 0
      ? { data: [...Buffer.from("云枫")], cursor: 6, truncated: true, closed: false, failed: false, exitCode: null }
      : { data: [], cursor: 6, truncated: false, closed: true, failed: false, exitCode: 7 };
    return null;
  });
  const output: Buffer[] = [];
  const result = await terminalOperations(call).exec("printf test", "/tmp", { onData: data => output.push(data) });
  assert.equal(result.exitCode, 7);
  assert.match(Buffer.concat(output).toString(), /截断.*\n云枫/s);
  assert.deepEqual(actions, ["start", "read", "read", "release"]);
});
test("取消和超时均停止 PTY 后释放；创建前取消不执行，清理失败可见", async () => {
  for (const reason of ["abort", "timeout", "cleanup"] as const) {
    const controller = new AbortController();
    const actions: string[] = [];
    const call = fake(request => {
      actions.push(request.action);
      if (request.action === "start") { if (reason !== "timeout") controller.abort(); return { id: "pty" }; }
      if (request.action === "stop" && reason === "cleanup") throw new Error("stop failed");
      return { data: [], cursor: 0, closed: false, failed: false, truncated: false, exitCode: null };
    });
    await assert.rejects(terminalOperations(call).exec("sleep 30", "/tmp", {
      onData() {}, signal: controller.signal, timeout: reason === "timeout" ? 0.01 : 1,
    }), reason === "cleanup" ? /stop failed/ : reason === "abort" ? /aborted/ : /timeout/);
    assert.ok(actions.includes("stop"));
    assert.equal(actions.at(-1), reason === "cleanup" ? "stop" : "release");
    await assert.rejects(terminalOperations(call).exec("ignored", "/tmp", { onData() {}, signal: AbortSignal.abort() }), /aborted/);
  }
});
test("连接配置不回退到其他进程；错误不暴露令牌，断开不重放请求", async () => {
  assert.equal(terminalConnection({}), undefined);
  assert.throws(() => terminalConnection({ YUNFENG_TERMINAL_PORT: "0", YUNFENG_TERMINAL_TOKEN: "test-only" }), /配置无效/);
  let requests = 0;
  const server = createServer(socket => socket.once("data", () => { requests++; socket.end('{"error":{"code":"FORBIDDEN","message":"private-value"}}\n'); }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const call = terminalConnection({ YUNFENG_TERMINAL_PORT: String(address.port), YUNFENG_TERMINAL_TOKEN: "test-only" })!;
    await assert.rejects(call({ action: "stop", id: "unknown" }), error => error instanceof Error && error.message.includes("FORBIDDEN") && !error.message.includes("private-value"));
    assert.equal(requests, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
