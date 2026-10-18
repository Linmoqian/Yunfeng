/* 工具反馈验收：真实顺序作业、权限失败、取消与观察端故障不会导致重放。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JobExecutor } from "../src/research/executor.js";
import { traceExecution, type ExecutionFeedback } from "../src/research/tool-feedback.js";
import type { Plan, Result } from "../src/research/types.js";

test("顺序执行只产生一次回执，相邻写入仍合批，参数与文件内容不进入反馈", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-feedback-")), jobs = new JobExecutor();
  const events: ExecutionFeedback[] = [];
  try {
    await mkdir(join(root, ".lin/experiments"), { recursive: true });
    await writeFile(join(root, "source.txt"), "private-content");
    const plan: Plan = { decision: "act", reason: "核验", steps: [
      { action: "read_file", path: "source.txt" },
      { action: "write_file", path: ".lin/experiments/a", content: "private-content" },
      { action: "write_file", path: ".lin/experiments/b", content: "ok" },
      { action: "patch_file", path: ".lin/experiments/a", old_text: "private-content", new_text: "patched" },
      { action: "run_command", program: process.execPath, args: ["-e", "require('node:fs').writeFileSync('.lin/experiments/proof','ok')"] },
      { action: "read_horizon", domain: "training" },
    ], success_condition: { kind: "file_exists", path: ".lin/experiments/proof" } };
    const result = await new Promise<Result>((resolve) => jobs.start("job", root, plan, async (value) => { resolve(value); }, undefined, undefined, async () => {}, async () => ({ available: false }), async (event) => { events.push(event); }));
    assert.equal(result.status, "succeeded");
    assert.deepEqual(events.filter((e) => e.type === "tool_started").map((e) => e.data.name), ["read", "modify", "modify", "terminal", "horizon"]);
    const finished = events.filter((e) => e.type === "tool_finished");
    assert.equal(finished.length, 5); assert.equal(new Set(finished.map((e) => e.data.callId)).size, 5);
    assert.ok(finished.every((e) => e.data.outcome === "succeeded" && e.data.elapsedMs! >= 0));
    assert.ok(!JSON.stringify(events).includes("private-content"));
    assert.ok(!JSON.stringify(events).includes("require("));
    assert.equal(await readFile(join(root, ".lin/experiments/a"), "utf8"), "patched");
  } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
});

test("授权撤销与取消保留失败回执，反馈故障不能重放已完成的操作", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-feedback-denied-")), jobs = new JobExecutor();
  const events: ExecutionFeedback[] = [];
  try {
    const result = await new Promise<Result>((resolve) => jobs.start("denied", root, { decision: "act", reason: "核验", steps: [{ action: "write_file", path: "forbidden", content: "x" }] }, async (value) => { resolve(value); }, undefined, undefined, async () => { throw new Error("TOOL_FORBIDDEN"); }, undefined, async (event) => { events.push(event); }));
    assert.equal(result.status, "failed"); assert.equal(events.at(-1)!.data.outcome, "failed");
    await assert.rejects(readFile(join(root, "forbidden")), { code: "ENOENT" });
    const controller = new AbortController();
    await assert.rejects(traceExecution("cancelled", 0, { action: "read_horizon", domain: "training" }, controller.signal, async (e) => { events.push(e); }, async () => { controller.abort(); controller.signal.throwIfAborted(); }));
    assert.equal(events.at(-1)!.data.outcome, "cancelled");
    let executed = 0;
    await traceExecution("observer", 0, { action: "read_horizon", domain: "training" }, new AbortController().signal, async () => { throw new Error("observer unavailable"); }, async () => { executed++; });
    assert.equal(executed, 1);
  } finally { await jobs.close(); await rm(root, { recursive: true, force: true }); }
});
