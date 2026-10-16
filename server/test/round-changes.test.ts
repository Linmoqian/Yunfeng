/* 本轮变更回归：既有脏文件、提交后冻结、下一轮和持久化恢复。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { beginRound, measureRound } from "../src/task/round-changes.js";
import { createTaskContextForDataDir } from "../src/task/task-context.js";

test("只统计本轮内容差异，覆盖已有改动、未跟踪文件、删除、二进制和提交", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yf-round-test-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args]);
  try {
    git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
    await writeFile(path.join(dir, "old.txt"), "original\n");
    await writeFile(path.join(dir, "delete.txt"), "delete\n");
    git("add", "--", "old.txt", "delete.txt"); git("commit", "-qm", "initial");
    await writeFile(path.join(dir, "old.txt"), "existing\n");
    await writeFile(path.join(dir, "untouched.txt"), "preexisting\n");
    const round = (await beginRound(dir))!;
    assert.equal((await measureRound(round)).files.length, 0);
    await writeFile(path.join(dir, "old.txt"), "existing\nnew\n");
    await writeFile(path.join(dir, "new.txt"), "new file");
    await writeFile(path.join(dir, "binary.bin"), Buffer.from([0, 1]));
    await writeFile(path.join(dir, ".env"), "secret");
    await rm(path.join(dir, "delete.txt"));
    git("add", "--", "old.txt", "new.txt", "delete.txt"); git("commit", "-qm", "round");
    const measured = await measureRound(round, true);
    const files = Object.fromEntries(measured.files.map((file) => [path.basename(file.filePath), file]));
    assert.deepEqual(Object.keys(files).sort(), ["binary.bin", "delete.txt", "new.txt", "old.txt"]);
    assert.equal(files["old.txt"].additions, 1); assert.equal(files["old.txt"].deletions, 0);
    assert.equal(files["delete.txt"].deletions, 1); assert.equal(files["new.txt"].additions, 1);
    assert.equal(files["binary.bin"].additions, null);
    await writeFile(path.join(dir, "old.txt"), "later\n");
    assert.deepEqual(await measureRound(measured), measured);
    assert.equal((await measureRound((await beginRound(dir))!)).files.length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("子目录范围、统计落盘、重启保留及异常中断冻结", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yf-round-store-"));
  try {
    const project = path.join(dir, "project"), cwd = path.join(project, "sub"), data = path.join(dir, "data");
    await mkdir(cwd, { recursive: true });
    execFileSync("git", ["-C", project, "init", "-q"]);
    await writeFile(path.join(cwd, "first.ts"), "first\n");
    const { store, runtime } = createTaskContextForDataDir(data);
    const task = store.create({ sessionId: "test", cwd, title: "stats", source: "task" });
    await runtime.beginChanges(task.id);
    await writeFile(path.join(cwd, "first.ts"), "first\nsecond\n");
    await writeFile(path.join(project, "outside.txt"), "outside\n");
    const measured = await runtime.readChanges(task.id);
    assert.equal(measured?.files.length, 1); assert.equal(measured?.files[0].additions, 1);
    assert.equal("baseline" in measured!, false);
    const restored = createTaskContextForDataDir(data);
    await writeFile(path.join(cwd, "first.ts"), "unrelated after restart\n");
    const frozen = await restored.runtime.readChanges(task.id);
    assert.equal(frozen?.interrupted, true); assert.deepEqual(frozen?.files, measured?.files);
    await restored.runtime.beginChanges(task.id);
    assert.equal((await restored.runtime.readChanges(task.id))?.files.length, 0);
    await writeFile(path.join(cwd, "first.ts"), "unrelated after restart\nthird\n");
    await restored.runtime.finishChanges(task.id);
    const next = await createTaskContextForDataDir(data).runtime.readChanges(task.id);
    assert.equal(next?.files[0].additions, 1); assert.notEqual(next?.id, measured?.id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("真实命令入口先保存基线，Agent 结束后自动冻结并发出刷新事件", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "yf-round-command-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q"]);
    const { store, runtime, hub } = createTaskContextForDataDir(path.join(dir, "data"));
    const task = store.create({ sessionId: "command-test", cwd: dir, title: "command", source: "task" });
    let listener: (event: { type: string; willRetry?: boolean }) => void = () => {};
    const wrapper = {
      sessionId: task.sessionId, cwd: dir, onDestroy: () => {},
      onEvent: (callback: typeof listener) => { listener = callback; return () => {}; },
      send: async () => {
        assert.ok(store.readRoundChanges(task.id));
        await writeFile(path.join(dir, "result.ts"), "result\n");
        listener({ type: "agent_end", willRetry: false });
        assert.equal(store.readRoundChanges(task.id)?.completedAt, undefined);
        await writeFile(path.join(dir, "result.ts"), "result\nqueued result\n");
        listener({ type: "agent_settled" });
      },
    };
    runtime.attachRuntime(wrapper as never);
    const settled = new Promise<void>((resolve) => hub.subscribeTask(task.id, (event) => { if (event.type === "run_settled") resolve(); }));
    await runtime.dispatchCommand(task, { type: "prompt", message: "run" });
    await settled;
    const summary = await runtime.readChanges(task.id);
    assert.ok(summary?.completedAt);
    assert.equal(summary?.files.find((file) => file.filePath.endsWith("result.ts"))?.additions, 2);
    assert.equal(task.status, "waiting_input");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
