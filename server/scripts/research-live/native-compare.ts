/* 当前 Node 实现与 Rust 核心的等价输入、完整管道往返及启动/RSS 对照。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, readFile, stat, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { cpus, platform, arch } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ResearchGraphStore } from "../../src/research/decision/store.js";
const exec = promisify(execFile);
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("需要尚不存在的独立输出目录");
const binary = fileURLToPath(new URL("../../../app/src-tauri/research-kernel/target/release/yunfeng-research-kernel", import.meta.url));
const nodeWorker = fileURLToPath(new URL("./native-worker.mjs", import.meta.url));
const hash = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const sourceHashes = Object.fromEntries(await Promise.all(["../../dist/research/project.js", "../../dist/research/executor.js", "../../dist/research/decision/store.js", "../../dist/task/task-store.js", "../../dist/task/task-event-hub.js", "./native-worker.mjs", "./native-compare.ts"].map(async (path) => [path, await hash(fileURLToPath(new URL(path, import.meta.url)))])));
const rustBinaryHash = await hash(binary);
const { fixtureHandler } = await import(new URL("./native-worker.mjs", import.meta.url).href);
const at = "2026-10-18T00:00:00.000Z", condition = { kind: "metric", path: ".lin/experiments/report.json", key: "completed", operator: "==", value: 1 };
const template = { schemaVersion: 1, id: "bench-task", sessionId: "bench", cwd: "", title: "本地性能", source: "task", mode: "research", status: "waiting_input", phase: "unknown", currentAction: "", activeToolNames: [], pendingApprovalIds: [], createdAt: at, updatedAt: at, lastEventSeq: 0,
  autonomy: { schemaVersion: 1, goal: "本地性能", phase: "WAITING", cycle: 0, maxCycles: 20, reason: "测量", permissions: { commands: [], writeRoots: [] }, decision: { mission: { id: "mission", objective: "本地性能" }, horizon: [], budget: { limit: 10, spent: 0 }, reason: "等待局部决策", nodes: Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, parent: "mission", objective: `实验 ${i}`, kind: "execute", priority: .5, confidence: .9, cost: .1, expected_gain: .8, status: "pending", attempts: 0 })) } } };
async function prepare(path: string) {
  await mkdir(join(path, ".lin/experiments"), { recursive: true });
  await writeFile(join(path, "task.json"), JSON.stringify({ ...template, cwd: path }));
  await writeFile(join(path, "control.json"), '{"ready":false}');
  await writeFile(join(path, ".lin/experiments/report.json"), '{"completed":1,"nested":{"score":0.93},"string":"1","bool":true}');
  await writeFile(join(path, "payload.txt"), "local scientific data\n".repeat(390));
}
type Request = Record<string, unknown>;
type Response = { ok: boolean; value?: any; code?: string; innerMs: number };
async function worker(kind: "node" | "rust", path: string) {
  const start = performance.now();
  const child = spawn(kind === "node" ? process.execPath : binary, kind === "node" ? [nodeWorker, path] : [path], { stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  let waiter: { resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096); });
  const next = () => new Promise<any>((resolve, reject) => { assert.equal(waiter, undefined); waiter = { resolve, reject }; });
  const fail = (error: Error) => { const pending = waiter; waiter = undefined; pending?.reject(error); };
  lines.on("line", (line) => { const pending = waiter; waiter = undefined; try { pending?.resolve(JSON.parse(line)); } catch { pending?.reject(new Error("invalid frame")); } });
  child.on("error", fail);
  child.on("close", () => fail(new Error(`worker closed ${stderr}`)));
  const readyDeadline = setTimeout(() => { fail(new Error("worker startup timeout")); child.kill(); }, 10000);
  try { assert.deepEqual(await next(), { ready: true }); } catch (error) { child.kill(); throw error; } finally { clearTimeout(readyDeadline); }
  const startupMs = performance.now() - start;
  return { pid: child.pid!, startupMs, async call(request: Request): Promise<{ totalMs: number; response: Response }> {
    const start = performance.now(), response = next();
    const deadline = setTimeout(() => { fail(new Error("request timeout")); child.kill(); }, 10000);
    try { child.stdin.write(JSON.stringify({ ...request, at }) + "\n"); const value = await response as Response; return { totalMs: performance.now() - start, response: value }; }
    finally { clearTimeout(deadline); }
  }, async close() {
    if (child.exitCode !== null || child.signalCode !== null) { lines.close(); return; }
    const closed = once(child, "close"), deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.stdin.end();
    try { await closed; } finally { clearTimeout(deadline); lines.close(); }
  } };
}
function stats(values: number[]) {
  const ordered = values.slice().sort((a, b) => a - b);
  return { p50Ms: ordered[Math.floor(ordered.length * .5)]!, p95Ms: ordered[Math.floor(ordered.length * .95)]!, samples: values.length };
}
const results: Record<string, Record<string, ReturnType<typeof stats>>> = {};
async function rss(pid: number) { return Number((await exec("ps", ["-o", "rss=", "-p", String(pid)])).stdout.trim()); }
await mkdir(root); // 不复用旧产物或真实业务目录。
for (const name of ["node", "rust", "direct"]) await prepare(join(root, name));
const node = await worker("node", join(root, "node"));
let rust: Awaited<ReturnType<typeof worker>> | undefined;
const direct = await fixtureHandler(join(root, "direct"));
try {
  rust = await worker("rust", join(root, "rust"));
  const memoryBefore = { nodeKiB: await rss(node.pid), rustKiB: await rss(rust.pid) };
  const cases: Record<string, Request> = {
    pingSmall: { op: "ping", payload: "x".repeat(128) }, ping64KiB: { op: "ping", payload: "x".repeat(65536) },
    read: { op: "read", path: "payload.txt" }, evaluate: { op: "evaluate", condition },
    write: { op: "write", path: ".lin/experiments/config.json", content: "{}", condition: { kind: "file_exists", path: ".lin/experiments/report.json" } },
    checkpoint100Nodes: { op: "checkpoint" }, event100Nodes: { op: "event" },
  };
  for (const [name, base] of Object.entries(cases)) {
    const values: Record<string, number[]> = { nodeDirect: [], nodePipe: [], nodeInner: [], rustPipe: [], rustInner: [] };
    for (let i = 0; i < 105; i += 1) {
      const request = { ...base, reason: `更新 ${i}`, at };
      const start = performance.now(); const directValue = await direct.call(request); const elapsed = performance.now() - start;
      let n: Awaited<ReturnType<typeof node.call>>, r: Awaited<ReturnType<typeof node.call>>;
      if (i % 2 === 0) { n = await node.call(request); r = await rust.call(request); }
      else { r = await rust.call(request); n = await node.call(request); }
      assert.equal(n!.response.ok, true); assert.equal(r!.response.ok, true);
      assert.deepEqual(r!.response.value, n!.response.value); assert.deepEqual(directValue, n!.response.value);
      if (i < 5) continue;
      values.nodeDirect!.push(elapsed); values.nodePipe!.push(n!.totalMs); values.nodeInner!.push(n!.response.innerMs); values.rustPipe!.push(r!.totalMs); values.rustInner!.push(r!.response.innerMs);
    }
    results[name] = Object.fromEntries(Object.entries(values).map(([key, samples]) => [key, stats(samples)]));
    console.log(JSON.stringify({ case: name, ...results[name] }));
  }
  const normalize = (task: any) => ({ ...task, cwd: "fixture" });
  const n = (await node.call({ op: "snapshot" })).response.value, r = (await rust.call({ op: "snapshot" })).response.value;
  assert.deepEqual(normalize(r), normalize(n));
  const fromRustDb = new ResearchGraphStore(join(root, "rust/data")).readAll()[0];
  assert.deepEqual(normalize(fromRustDb), normalize(r));
  const fromNodeDb = JSON.parse((await exec(binary, ["--inspect", join(root, "node")])).stdout);
  assert.deepEqual(normalize(fromNodeDb), normalize(n));
  for (const path of ["../outside.txt", ".env", "link"]) {
    if (path === "link") for (const dir of ["node", "rust"]) await symlink(join(root, dir, "control.json"), join(root, dir, "link"));
    assert.equal((await node.call({ op: "read", path })).response.ok, false);
    assert.equal((await rust.call({ op: "read", path })).response.ok, false);
  }
  for (const key of ["string", "bool", "missing"]) {
    for (const target of [node, rust]) assert.equal((await target.call({ op: "evaluate", condition: { ...condition, key } })).response.value.passed, false);
  }
  assert.equal(await readFile(join(root, "rust/.lin/experiments/config.json"), "utf8"), "{}");
  const memoryAfter = { nodeKiB: await rss(node.pid), rustKiB: await rss(rust.pid) };
  const launches: Record<string, ReturnType<typeof stats>> = {}, ready: Record<string, ReturnType<typeof stats>> = {};
  for (const kind of ["node", "rust"] as const) {
    const launchTimes = [], readyTimes = [];
    for (let i = 0; i < 15; i += 1) {
      const start = performance.now();
      assert.equal((await exec(kind === "node" ? process.execPath : binary, kind === "node" ? ["-e", "process.stdout.write('ok')"] : ["--noop"])).stdout, "ok");
      launchTimes.push(performance.now() - start);
    }
    for (let i = 0; i < 5; i += 1) {
      const path = join(root, `startup-${kind}-${i}`); await prepare(path);
      const instance = await worker(kind, path); readyTimes.push(instance.startupMs); await instance.close();
    }
    launches[kind] = stats(launchTimes); ready[kind] = stats(readyTimes);
  }
  const db = new DatabaseSync(":memory:"); const sqlite = db.prepare("SELECT sqlite_version() AS version").get()!.version; db.close();
  assert.equal(await hash(binary), rustBinaryHash, "测量期间 Rust 二进制不能被重建替换");
  const report = { sourceHashes: { ...sourceHashes, rustBinary: rustBinaryHash }, environment: { node: process.version, rust: (await exec("rustc", ["--version"])).stdout.trim(), platform: platform(), arch: arch(), cpu: cpus()[0]?.model, nodeSqlite: sqlite, rustSqlite: JSON.parse((await exec(binary, ["--info"])).stdout).sqlite }, results, startup: { noop: launches, ready }, memory: { before: memoryBefore, after: memoryAfter, unit: "KiB RSS, sampled not peak" }, rustBinaryBytes: (await stat(binary)).size, parity: { snapshots: true, crossDatabaseRead: true, boundedPathAndMetricChecks: true } };
  await writeFile(join(root, "comparison.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: "comparison-passed", output: join(root, "comparison.json"), startup: report.startup, memory: report.memory }));
} finally { await direct.close(); await node.close(); await rust?.close(); }
