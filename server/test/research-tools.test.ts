/* 核心工具的仲裁硬门槛、资源冲突、取消与视界边界。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ToolArbiter, toolPolicy, toolResources, withToolScope } from "../src/research/tool-arbiter.js";
import { createHorizon } from "../src/research/horizon.js";
import { step } from "../src/research/validation.js";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const gate = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };
const resource = [{ key: "same-file", write: true }];

test("权重只排序就绪调用，权限重检和等待取消不能被分数绕过", async () => {
  const arbiter = new ToolArbiter(() => 0), hold = gate(), order: string[] = [];
  const running = arbiter.run({ tool: "modify", resources: resource }, () => hold.promise);
  await tick();
  let allowed = true;
  const denied = arbiter.run({ tool: "read", resources: resource, authorize: async () => { if (!allowed) throw new Error("forbidden"); } }, async () => { order.push("denied"); });
  const cancelled = new AbortController();
  const removed = arbiter.run({ tool: "read", resources: resource, signal: cancelled.signal }, async () => { order.push("cancelled"); });
  const terminal = arbiter.run({ tool: "terminal", resources: resource }, async () => { order.push("terminal"); });
  const read = arbiter.run({ tool: "read", resources: resource }, async () => { order.push("read"); });
  const deniedCheck = assert.rejects(denied, /forbidden/), cancelledCheck = assert.rejects(removed, /取消/);
  await tick(); allowed = false; cancelled.abort(); hold.release();
  await Promise.all([running, deniedCheck, cancelledCheck, terminal, read]);
  assert.deepEqual(order, ["read", "terminal"]);
  assert.deepEqual(arbiter.status, { policy: 1, active: 0, waiting: 0 });
  assert.ok(arbiter.receipts().some((r) => r.outcome === "failed"));
});

test("并发读取允许共存，项目修改与终端互斥，队列有背压且作用域取消生效", async () => {
  const arbiter = new ToolArbiter(), hold = gate();
  const writes = toolResources("/fixture", ["config"], true);
  const first = arbiter.run({ tool: "terminal", resources: toolResources("/fixture", [], true) }, () => hold.promise);
  await tick(); let modified = false;
  const waiting = arbiter.run({ tool: "modify", resources: writes }, async () => { modified = true; });
  const readers = Array.from({ length: 2 }, () => arbiter.run({ tool: "read", resources: toolResources("/fixture", ["other"]) }, async () => true));
  assert.deepEqual(await Promise.all(readers), [true, true]); assert.equal(modified, false);
  const queued = Array.from({ length: toolPolicy.maxQueued - 1 }, () => arbiter.run({ tool: "modify", resources: writes }, async () => {}));
  await tick(); await assert.rejects(arbiter.run({ tool: "read", resources: [] }, async () => {}), /容量/);
  hold.release(); await Promise.all([first, waiting, ...queued]); assert.equal(modified, true);
  await assert.rejects(withToolScope({ signal: AbortSignal.abort() }, () => arbiter.run({ tool: "read", resources: [] }, async () => { throw new Error("must not execute"); })), /abort/i);
});

test("视界复用端口且显式报告未接入，拒绝越权形状和过大投影", async () => {
  const horizon = createHorizon("task", { training: async () => ({ summary: "实验运行中", data: { epoch: 3 } }), writing: async () => ({ summary: "x".repeat(16001) }) });
  assert.deepEqual(await horizon.read("training"), { domain: "training", available: true, summary: "实验运行中", data: { epoch: 3 } });
  assert.equal((await horizon.read("literature")).available, false);
  await assert.rejects(horizon.read("writing"), /超过上限/);
  assert.throws(() => step({ action: "read_horizon", domain: "shell" }), /无效/);
  assert.throws(() => step({ action: "patch_file", path: "x", old_text: "", new_text: "y" }), /无效/);
  assert.throws(() => step({ action: "run_command", program: "node", args: [], priority: 100 }), /未知字段/);
});
