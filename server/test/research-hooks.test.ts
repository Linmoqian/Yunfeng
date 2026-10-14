/* Hook 核心验收：事件合并、背压、过期通知、事实门控与关闭回收。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { HookLayer } from "../src/research/hooks/layer.js";
import { researchEvent, type HookSignal } from "../src/research/hooks/types.js";
import { contextChanged } from "../src/research/context.js";
import type { ResearchCheckpoint, State } from "../src/research/types.js";
const checkpoint = (): ResearchCheckpoint => ({ schemaVersion: 1, goal: "实验", phase: "WAITING", cycle: 1, maxCycles: 20, reason: "等待", permissions: { commands: [], writeRoots: [] } });
test("繁忙时合并文件事件，去重通知并丢弃已处理作业事件", () => {
  const state = checkpoint();
  let ready = false;
  const batches: HookSignal[][] = [];
  const hooks = new HookLayer(() => state, () => ready, (events) => { batches.push(events); return true; });
  try {
    const event = researchEvent({ kind: "files_changed", paths: ["README.md"] });
    assert.equal(hooks.publish(event), true);
    assert.equal(hooks.publish(event), false);
    for (let i = 0; i < 200; i += 1) hooks.publish(researchEvent({ kind: "files_changed", paths: ["README.md", "metrics.json"] }));
    hooks.flush();
    assert.equal(hooks.pendingCount, 1); assert.equal(batches.length, 0);
    state.jobId = "job"; state.result = { job_id: "job", status: "failed" };
    hooks.publish(researchEvent({ kind: "job_completed", jobId: "job", status: "failed" }));
    // 在队列交付前已被另一恢复入口处理，不能再次消费模型预算。
    delete state.jobId; delete state.result;
    ready = true; hooks.flush();
    assert.equal(batches.length, 1); assert.equal(batches[0]!.length, 1);
    assert.deepEqual((batches[0]![0]!.event as { paths: string[] }).paths, ["README.md", "metrics.json"]);
    hooks.close(); assert.equal(hooks.publish(researchEvent({ kind: "lifecycle", action: "resumed" })), false);
  } finally { hooks.close(); }
});
test("事件队列满载拒绝新增，关闭后不会继续交付", () => {
  const hooks = new HookLayer(checkpoint, () => false, () => { throw new Error("不应交付"); }, [{ name: "adapter", accept: () => "本地通知" }]);
  try {
    for (let i = 0; i < 32; i += 1) assert.equal(hooks.publish(researchEvent({ kind: "approval_granted", requestId: String(i) })), true);
    assert.equal(hooks.publish(researchEvent({ kind: "approval_granted", requestId: "overflow" })), false);
    assert.equal(hooks.pendingCount, 32);
    hooks.close(); assert.equal(hooks.pendingCount, 0); hooks.flush();
  } finally { hooks.close(); }
});
test("文件通知不能充当事实，内容未变不触发模型，作业结果仍需处理", () => {
  const state: State = { facts: [{ key: "file:README.md", value: "before", timestamp: "test", source: "filesystem" }], events: [], memory: [], constraints: [] };
  const signals: HookSignal[] = [{ hook: "file", reason: "变更通知", event: researchEvent({ kind: "files_changed", paths: ["README.md"] }) }];
  assert.equal(contextChanged(state, structuredClone(state), signals), false);
  const changed = structuredClone(state); changed.facts[0]!.value = "after";
  assert.equal(contextChanged(state, changed, signals), true);
  assert.equal(contextChanged(state, state, [{ hook: "job", reason: "结果", event: researchEvent({ kind: "job_completed", jobId: "job", status: "failed" }) }]), true);
});
