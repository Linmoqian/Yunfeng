// TaskStore / TaskEventHub / TaskRuntime 单元测试。
// 使用临时数据目录（YUNFENG_DATA_DIR 覆盖），不接触真实 ~/.yunfeng。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskStore } from "../src/task/task-store.js";
import { TaskEventHub } from "../src/task/task-event-hub.js";
import { TaskRuntime, isTaskCommand } from "../src/task/task-runtime.js";

function tempContext() {
  const dir = mkdtempSync(path.join(tmpdir(), "yf-task-test-"));
  const store = new TaskStore({ dataDir: dir });
  const hub = new TaskEventHub(store);
  const runtime = new TaskRuntime({ store, hub });
  return { dir, store, hub, runtime, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("TaskStore 创建任务并原子持久化", () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s1", cwd: "/tmp/proj", title: "测试任务", source: "task" });
    assert.equal(state.status, "waiting_input");
    // 重新加载的数据目录应读到同一份状态
    const store2 = new TaskStore({ dataDir: ctx.dir });
    const loaded = store2.get(state.id);
    assert.ok(loaded);
    assert.equal(loaded.title, "测试任务");
  } finally {
    ctx.cleanup();
  }
});

test("TaskStore 事件 seq 递增并在重载后恢复 lastEventSeq", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s2", cwd: "/tmp/proj", title: "事件测试", source: "task" });
    const a = await ctx.hub.emit(state.id, "task_updated", { status: "running" });
    const b = await ctx.hub.emit(state.id, "message_delta", { delta: "hello" });
    const c = await ctx.hub.emit(state.id, "thinking_delta", { delta: "分析中" });
    assert.equal(a.taskId, state.id);
    // seq 应从 1 开始单调递增
    assert.ok(a.seq >= 1);
    assert.ok(b.seq > a.seq);
    assert.ok(c.seq > b.seq);

    // 重载后 lastEventSeq 恢复
    const store2 = new TaskStore({ dataDir: ctx.dir });
    assert.equal(store2.get(state.id)!.lastEventSeq, c.seq);
    // 续写 seq 不回退
    const hub2 = new TaskEventHub(store2);
    await hub2.emit(state.id, "task_updated", { status: "completed" });
    assert.ok(store2.get(state.id)!.lastEventSeq > c.seq);
  } finally {
    ctx.cleanup();
  }
});

test("TaskEventHub 按 seq 补发错过的历史事件", () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s3", cwd: "/tmp/proj", title: "", source: "task" });
    void ctx.hub.emit(state.id, "task_updated", { status: "running" });
    void ctx.hub.emit(state.id, "message_delta", { delta: "a" });
    void ctx.hub.emit(state.id, "message_delta", { delta: "b" });
    const state4 = ctx.store.create({ sessionId: "s4", cwd: "/tmp/proj", title: "", source: "task" });
    void ctx.hub.emit(state4.id, "message_delta", { delta: "z" });

    const received: { type: string; taskId: string }[] = [];
    // 从 afterSeq=0 订阅，应能拿到该任务全部历史事件
    let cleanup: () => void = () => {};
    cleanup = ctx.hub.subscribeTaskSse(
      state.id,
      (chunk) => {
        const data = JSON.parse(chunk.split("data:")[1] ?? "{}") as { type?: string; taskId?: string };
        if (data.type) received.push({ type: data.type, taskId: data.taskId ?? "" });
      },
      () => {},
      0,
    );
    cleanup();

    assert.ok(received.some((e) => e.type === "task_updated" && e.taskId === state.id));
    assert.ok(received.some((e) => e.type === "message_delta" && e.taskId === state.id));
    // s4 的事件不应出现在 s3 的任务流中
    assert.ok(!received.some((e) => e.type === "message_delta" && e.taskId === state4.id));
  } finally {
    ctx.cleanup();
  }
});

test("TaskRuntime 状态转换：run -> waiting_input -> completed", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s5", cwd: "/tmp/proj", title: "状态机", source: "task" });
    // complete 命令
    const res = await ctx.runtime.execCommand(state.id, { type: "complete" });
    assert.deepEqual(ctx.store.get(state.id)!.status, "completed");
    assert.ok(ctx.store.get(state.id)!.completedAt);
    // reopen
    await ctx.runtime.execCommand(state.id, { type: "reopen" });
    assert.equal(ctx.store.get(state.id)!.status, "waiting_input");
    // archive
    await ctx.runtime.execCommand(state.id, { type: "archive" });
    assert.equal(ctx.store.get(state.id)!.status, "archived");
  } finally {
    ctx.cleanup();
  }
});

test("isTaskCommand 校验合法与非法命令", () => {
  assert.equal(isTaskCommand({ type: "prompt", message: "hello" }), true);
  assert.equal(isTaskCommand({ type: "abort" }), true);
  assert.equal(isTaskCommand({ type: "complete" }), true);
  assert.equal(isTaskCommand({ type: "clearQueue" }), true);
  assert.equal(isTaskCommand({ type: "getQueue" }), true);
  assert.equal(isTaskCommand({ type: "setTools", toolNames: ["read"] }), true);
  assert.equal(isTaskCommand({ type: "prompt" }), false);
  assert.equal(isTaskCommand({ type: "unknown" }), false);
  assert.equal(isTaskCommand({ type: "setTools", toolNames: "read" }), false);
});

test("TaskEventHub 清理回调：退订后不再收到事件", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s7", cwd: "/tmp/proj", title: "清理", source: "task" });
    let received = 0;
    const unsubscribe = ctx.hub.subscribeTask(state.id, () => { received += 1; });
    await ctx.hub.emit(state.id, "task_updated", { status: "running" });
    assert.equal(received, 1);
    unsubscribe();
    await ctx.hub.emit(state.id, "task_updated", { status: "completed" });
    assert.equal(received, 1, "退订后不应再收到事件");
    // SSE 客户端集合也应清空
    assert.equal((ctx.hub as unknown as { taskSse: Map<string, Set<unknown>> }).taskSse.size, 0);
  } finally {
    ctx.cleanup();
  }
});

test("审批：创建介入→任务进 waiting_approval→批准→待决清空", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "a1", cwd: "/tmp/proj", title: "审批", source: "task" });
    const intervention = await ctx.runtime.createIntervention(state.id, {
      kind: "confirm",
      title: "确认推送",
      message: "要推送到远程吗？",
      safeLabel: "git push",
    });
    // 任务进入等待审批，待决列表含请求 id
    assert.equal(ctx.store.get(state.id)!.status, "waiting_approval");
    assert.ok(ctx.store.get(state.id)!.pendingApprovalIds.includes(intervention.id));
    assert.equal(ctx.store.listInterventions(state.id).length, 1);

    // 批准
    const result = ctx.runtime.resolveIntervention(state.id, intervention.id, true);
    assert.deepEqual(result, { ok: true });
    assert.equal(ctx.store.get(state.id)!.pendingApprovalIds.length, 0);
    assert.equal(ctx.runtime.listInterventions(state.id).length, 0, "已解决的介入不应再出现在待决列表");
    // store 层仍保留 resolved 记录（用于审计）
    assert.equal(ctx.store.listInterventions(state.id)[0]?.status, "resolved");

    // 重复解析拒绝
    const again = ctx.runtime.resolveIntervention(state.id, intervention.id, true);
    assert.equal(again.ok, false);
  } finally {
    ctx.cleanup();
  }
});

test("审批：未决介入在服务重启后失效，绝不自动放行", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "a2", cwd: "/tmp/proj", title: "重启失效", source: "task" });
    await ctx.runtime.createIntervention(state.id, { kind: "confirm", title: "待决", message: "" });
    assert.equal(ctx.store.get(state.id)!.status, "waiting_approval");

    // 模拟服务重启：用同一数据目录新建 runtime（构造时失效未决审批）
    const store2 = new TaskStore({ dataDir: ctx.dir });
    const hub2 = new TaskEventHub(store2);
    const runtime2 = new TaskRuntime({ store: store2, hub: hub2 });

    const reloaded = store2.get(state.id)!;
    assert.equal(reloaded.status, "waiting_input", "重启后应回到等待输入");
    assert.equal(reloaded.pendingApprovalIds.length, 0);
    assert.equal(runtime2.listInterventions(state.id).length, 0, "重启后未决介入应失效并移出待决");
    // store 层标记为 timed_out，绝不放行
    assert.equal(store2.listInterventions(state.id)[0]?.status, "timed_out");
  } finally {
    ctx.cleanup();
  }
});

/** 验证一个 SSE 客户端退订后不会重复推送。 */
test("TaskEventHub SSE 客户端断开后不再推送", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s8", cwd: "/tmp/proj", title: "sse", source: "task" });
    const chunks: string[] = [];
    const cleanup = ctx.hub.subscribeTaskSse(state.id, (c) => chunks.push(c), () => {}, 0);
    cleanup();
    await ctx.hub.emit(state.id, "task_updated", { status: "running" });
    // 断开后 emit 不应产生新推送
    const afterEmit = chunks.length;
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(chunks.length, afterEmit, "断开后不应再收到推送");
    assert.equal((ctx.hub as unknown as { taskSse: Map<string, Set<unknown>> }).taskSse.size, 0);
  } finally {
    ctx.cleanup();
  }
});

test("损坏的 state.json 不会导致进程崩溃", async () => {
  const ctx = tempContext();
  try {
    const state = ctx.store.create({ sessionId: "s6", cwd: "/tmp/proj", title: "", source: "task" });
    // 写入损坏内容
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(ctx.dir, "tasks", state.id, "state.json"), "{{bad json", "utf8");
    // 重新加载不应抛错，且不包含损坏任务
    const store2 = new TaskStore({ dataDir: ctx.dir });
    assert.equal(store2.get(state.id), undefined);
  } finally {
    ctx.cleanup();
  }
});
