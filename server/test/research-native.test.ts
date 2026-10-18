/* Rust 文件客户端的背压、故障不重放与 execute 取消边界。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:net";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeResearchFiles, researchFileClient, type ResearchEnvelope } from "../src/research/native-files.js";
import { writeExecutionFile } from "../src/research/execution-files.js";
import { JobExecutor } from "../src/research/executor.js";
import type { Result } from "../src/research/types.js";

test("文件调用有界，错误释放容量，未启用原生能力时保留独立运行", async () => {
  assert.equal(nativeResearchFiles({}), undefined);
  assert.throws(() => nativeResearchFiles({ YUNFENG_RESEARCH_NATIVE: "1" }), /未配置/);
  assert.throws(() => nativeResearchFiles({ YUNFENG_RESEARCH_NATIVE: "invalid" }), /标识无效/);
  const releases: (() => void)[] = [], requests: ResearchEnvelope[] = [];
  const client = researchFileClient(async <T>(request: ResearchEnvelope) => {
    requests.push(request); await new Promise<void>((resolve) => releases.push(resolve)); return "text" as T;
  });
  const pending = Array.from({ length: 8 }, () => client.read("fixture", "data.json"));
  await assert.rejects(client.write("fixture", "data.json", "{}"), /容量已满/);
  await assert.rejects(client.readMany("fixture", ["data.json"]), /容量已满/);
  await assert.rejects(client.readMany("fixture", Array(9).fill("data.json")), /一到八个/);
  await new Promise((resolve) => setImmediate(resolve));
  releases.splice(0).forEach((release) => release());
  await Promise.all(pending);
  assert.equal(requests.length, 8);
  const again = client.read("fixture", "data.json"); await new Promise((resolve) => setImmediate(resolve)); releases.shift()!(); await again;
  const failed = researchFileClient(async () => { throw new Error("rejected"); });
  for (let i = 0; i < 9; i++) await assert.rejects(failed.read("fixture", "data.json"), /rejected/);
});

test("原生连接断开不重试、不回退写入；开始前取消无副作用", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-native-client-"));
  const before = { flag: process.env.YUNFENG_RESEARCH_NATIVE, port: process.env.YUNFENG_APP_PORT, token: process.env.YUNFENG_APP_TOKEN };
  let requests = 0;
  let cancelOnDispatch: AbortController | undefined;
  const server = createServer((socket) => socket.once("data", (chunk) => {
    requests++;
    if (cancelOnDispatch) { cancelOnDispatch.abort(); socket.end(JSON.stringify({ result: JSON.parse(chunk.toString()).request.request.action === "write_many" ? { evaluation: null } : null }) + "\n"); }
    else socket.destroy();
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobs = new JobExecutor();
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    process.env.YUNFENG_RESEARCH_NATIVE = "1";
    process.env.YUNFENG_APP_PORT = String(address.port); process.env.YUNFENG_APP_TOKEN = "test-only";
    await assert.rejects(writeExecutionFile(root, "cancelled.json", "{}", AbortSignal.abort()));
    await assert.rejects(writeExecutionFile(root, "oversized.txt", "中".repeat(21846), new AbortController().signal), /64 KiB/);
    assert.equal(requests, 0);
    const result = await new Promise<Result>((resolve) => jobs.start("native-failure", root, { decision: "act", reason: "fault", steps: [{ action: "write_file", path: "out.json", content: "{}" }] }, async (value) => resolve(value)));
    assert.equal(result.status, "failed"); assert.match(result.output!, /连接/);
    assert.equal(requests, 1); await assert.rejects(readFile(join(root, "out.json")), { code: "ENOENT" });
    process.env.YUNFENG_RESEARCH_NATIVE = "2";
    await assert.rejects(writeExecutionFile(root, "batch-drop.json", "{}", new AbortController().signal), /连接/);
    assert.equal(requests, 2); await assert.rejects(readFile(join(root, "batch-drop.json")), { code: "ENOENT" });
    cancelOnDispatch = new AbortController();
    await assert.rejects(writeExecutionFile(root, "late-cancel.json", "{}", cancelOnDispatch.signal));
    assert.equal(requests, 3, "收到提交后取消不重放，也不误报成功");
  } finally {
    await jobs.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [name, value] of [["YUNFENG_RESEARCH_NATIVE", before.flag], ["YUNFENG_APP_PORT", before.port], ["YUNFENG_APP_TOKEN", before.token]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("相邻写入与末尾验收合并；组件操作截断批次，旧宿主保持逐项调用", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-native-batch-"));
  const keys = ["YUNFENG_RESEARCH_NATIVE", "YUNFENG_APP_PORT", "YUNFENG_APP_TOKEN"] as const;
  const before = keys.map((key) => process.env[key]);
  const requests: ResearchEnvelope[] = [], order: string[] = [];
  const server = createServer((socket) => {
    const lines = createInterface({ input: socket });
    lines.once("line", (line) => {
      const request = JSON.parse(line).request as ResearchEnvelope; requests.push(request);
      order.push(request.request.action);
      socket.end(JSON.stringify({ result: { evaluation: request.request.action === "write_many" && request.request.condition ? { passed: true, reason: "real port fixture" } : null } }) + "\n");
      lines.close();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobs = new JobExecutor();
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    process.env.YUNFENG_RESEARCH_NATIVE = "2";
    process.env.YUNFENG_APP_PORT = String(address.port); process.env.YUNFENG_APP_TOKEN = "fixture";
    const write = (path: string) => ({ action: "write_file" as const, path, content: "{}" });
    const result = await new Promise<Result>((resolve) => jobs.start("batch", root, {
      decision: "act", reason: "test", steps: [write("a"), write("b"), { action: "focus_component", component: "research-graph", target: "current" }, write("c"), write("d")],
      success_condition: { kind: "file_exists", path: "d" },
    }, async (value) => resolve(value), undefined, async () => { order.push("focus"); return "accepted"; }));
    assert.equal(result.status, "succeeded");
    assert.deepEqual(order, ["write_many", "focus", "write_many"]);
    assert.deepEqual(requests.map(({ request }) => request.action === "write_many" ? request.files.map((file) => file.path) : []), [["a", "b"], ["c", "d"]]);
    assert.deepEqual(requests.flatMap(({ request }) => request.action === "write_many" ? request.files.map((file) => Object.keys(file).sort()) : []), Array.from({ length: 4 }, () => ["content", "path"]));
    assert.equal(requests[0]!.request.action === "write_many" && requests[0]!.request.condition, undefined);
    const legacyCalls: string[] = [];
    const legacy = researchFileClient(async <T>({ request }: ResearchEnvelope) => {
      legacyCalls.push(request.action);
      return (request.action === "read" ? "text" : request.action === "evaluate" ? { passed: true } : null) as T;
    }, false);
    await legacy.readMany(root, ["a", "b"]);
    await legacy.writeMany(root, [write("a"), write("b")], { kind: "file_exists", path: "b" });
    assert.deepEqual(legacyCalls, ["read", "read", "write", "write", "evaluate"]);
  } finally {
    await jobs.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
    await rm(root, { recursive: true, force: true });
  }
});

test("科研 PTY 启动响应丢失只按身份回收，回收未确认标为中断，不重放或回退", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-pty-fault-"));
  const keys = ["YUNFENG_RESEARCH_NATIVE", "YUNFENG_TERMINAL_PORT", "YUNFENG_TERMINAL_TOKEN"] as const;
  const before = keys.map((key) => process.env[key]);
  const requests: { action: string; jobId: string }[] = [];
  let confirmCleanup = true;
  const server = createServer((socket) => {
    const lines = createInterface({ input: socket });
    lines.once("line", (line) => {
      const request = JSON.parse(line).request; requests.push(request);
      if (request.action === "stopJob" && confirmCleanup) socket.end('{"result":null}\n');
      else socket.destroy();
      lines.close();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const jobs = new JobExecutor();
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    process.env.YUNFENG_RESEARCH_NATIVE = "3";
    process.env.YUNFENG_TERMINAL_PORT = String(address.port); process.env.YUNFENG_TERMINAL_TOKEN = "fixture";
    const run = (id: string) => new Promise<Result>((resolve) => jobs.start(id, root, { decision: "act", reason: "fault",
      steps: [{ action: "run_command", program: process.execPath, args: ["-e", "require('node:fs').writeFileSync('fallback','bad')"] }],
    }, async (value) => resolve(value)));
    assert.equal((await run("confirmed")).status, "failed");
    confirmCleanup = false;
    const unknown = await run("unknown");
    assert.equal(unknown.status, "interrupted"); assert.match(unknown.output!, /TERMINAL_CLEANUP_FAILED/);
    assert.deepEqual(requests.map((r) => [r.action, r.jobId]), [["run", "confirmed:0"], ["stopJob", "confirmed:0"], ["run", "unknown:0"], ["stopJob", "unknown:0"]]);
    await assert.rejects(readFile(join(root, "fallback")), { code: "ENOENT" });
  } finally {
    await jobs.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
    await rm(root, { recursive: true, force: true });
  }
});
