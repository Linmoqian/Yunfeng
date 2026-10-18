/* 文献 execute 的核心回归：授权、来源去重、部分失败、缓存与取消。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { searchLiterature } from "../src/research/literature/search.js";
import { providerSearch } from "../src/research/literature/providers.js";
import { parsePlan } from "../src/research/validation.js";
import { planAuthorized } from "../src/research/core.js";
import { withToolScope } from "../src/research/tool-arbiter.js";
import { JobExecutor } from "../src/research/executor.js";
import { taskHorizon } from "../src/research/horizon-ports.js";
import { literatureEvidence, validateLiteratureLearning } from "../src/research/literature/evidence.js";
import type { TaskState } from "../src/task/types.js";
const input = { query: "public plant research", path: ".lin/experiments/literature.json" };
const rows = [
  { title: "First plant study", doi: "10.1234/plant1", authorList: { author: [{ fullName: "A One", lastName: "One" }] }, abstractText: "Measured plant height in controlled conditions." },
  { title: "Second independent study", doi: "10.1234/plant2", authorList: { author: [{ fullName: "B Two", lastName: "Two" }] }, abstractText: "Validated plant growth in a different dataset." },
];
const fakeFetch: typeof fetch = async (url) => new Response(JSON.stringify(String(url).includes("europepmc") ? { resultList: { result: rows } }
  : { message: { items: [{ title: [rows[0]!.title], DOI: rows[0]!.doi, author: [{ given: "A", family: "One" }] }] } }));

test("检索经过完整计划授权与 execute 回执，来源可恢复，重复查询不联网", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "yf-literature-"));
  const plan = parsePlan({ decision: "act", reason: "公开查询", steps: [{ action: "read_horizon", domain: "literature", ...input }], success_condition: { kind: "metric", path: input.path, key: "independent_candidates", operator: ">=", value: 2 } });
  const task = { id: "task", mode: "research", cwd, lastEventSeq: 1, autonomy: { permissions: { commands: [], writeRoots: [".lin/experiments"] } } } as unknown as TaskState;
  try {
    assert.equal(await planAuthorized(task, plan), false);
    task.autonomy!.authorizedPlan = JSON.stringify(plan);
    assert.equal(await planAuthorized(task, plan), true);
    const changed = structuredClone(plan); (changed.steps[0] as any).query = "another query";
    assert.equal(await planAuthorized(task, changed), false);
    let requests = 0;
    const report = await searchLiterature(cwd, input, new AbortController().signal, async (...args) => { requests++; return fakeFetch(...args); });
    assert.equal(requests, 2); assert.equal(report.data.source_count, 2); assert.equal(report.data.independent_candidates, 2);
    assert.equal(report.data.sources[0]!.origins.length, 2);
    assert.equal(report.data.pairs[0]!.status, "candidate");
    assert.ok(report.data.sources.every((s) => s.url.startsWith("https://doi.org/") && s.origins.every((o) => o.sha256.length === 64 && o.retrievedAt)));
    assert.deepEqual(JSON.parse(await readFile(join(cwd, input.path), "utf8")), report.data);
    const jobs = new JobExecutor(); const events: string[] = [];
    try {
      const result = await new Promise<import("../src/research/types.js").Result>((resolve) => {
        jobs.start("job", cwd, plan, async (r) => { resolve(r); }, undefined, undefined, async () => { assert.ok(await planAuthorized(task, plan)); }, undefined, async (e) => { events.push(e.type); });
      });
      assert.equal(result.status, "succeeded");
      assert.deepEqual(events, ["tool_started", "tool_finished"]);
      assert.equal(JSON.parse(result.output!.trim()).cached, true);
      const evidence = literatureEvidence({ job_id: "final", status: "succeeded" }, result);
      assert.equal(evidence!.sources.length, 2);
      assert.equal(evidence!.candidate_sources, 2);
      assert.equal(evidence!.retained_candidate_pairs, 1);
      assert.equal(evidence!.sources[0]!.excerpt, rows[0]!.abstractText);
      const learning = { summary: "只统计了两篇文献", knowledge_update: [], next_question: "" };
      assert.throws(() => validateLiteratureLearning({ literature: evidence }, learning), /两篇真实来源/);
      assert.throws(() => validateLiteratureLearning({ literature: evidence }, { ...learning, summary: "[来源](https://example.org/unknown)" }), /两篇真实来源/);
      assert.doesNotThrow(() => validateLiteratureLearning({ literature: evidence }, { ...learning, summary: evidence!.sources.map((s) => `[${s.title}](${s.url})`).join("、") + "均研究植物，测量对象不同，独立数据尚未核验。" }));
      task.autonomy!.result = result;
      const restored = structuredClone(task);
      const snapshot = await taskHorizon(() => restored).read("literature");
      assert.equal((snapshot.data as any).source_count, 2);
      assert.equal((snapshot.data as any).sources.length, 2);
      restored.autonomy!.lastResult = { job_id: "mission-check", status: "succeeded", output: "" };
      delete restored.autonomy!.result;
      restored.autonomy!.component = { component: "research", revision: 1, state: { jobId: result.job_id, source: input.path, updatedAt: "now", metrics: [] }, result };
      const completed = await taskHorizon(() => restored).read("literature");
      assert.equal((completed.data as any).source_count, 2, "最终验收不能覆盖组件保存的来源回执");
    } finally { await jobs.close(); }
    await assert.rejects(searchLiterature(cwd, { ...input, query: "changed" }, new AbortController().signal, fakeFetch), /LITERATURE_CONFLICT/);
    assert.equal(requests, 2);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("同作品与重合作者不构成双源，部分失败保留证据，撤权与取消不落盘", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "yf-literature-cancel-"));
  const signal = new AbortController();
  try {
    const result = await searchLiterature(cwd, input, signal.signal, async (url) => {
      if (String(url).includes("crossref")) return new Response("limited", { status: 429 });
      return new Response(JSON.stringify({ resultList: { result: [rows[0], { ...rows[1], authorList: rows[0]!.authorList }] } }));
    });
    assert.equal(result.data.independent_candidates, 0);
    assert.equal(result.data.providers[1]!.status, "LITERATURE_HTTP_429");
    assert.match(result.data.summary, /证据不足/);
    const next = { ...input, path: ".lin/experiments/cancel.json" };
    await assert.rejects(withToolScope({ authorize: async () => { throw new Error("revoked"); } }, () => searchLiterature(cwd, next, signal.signal, fakeFetch)), /revoked/);
    const running = searchLiterature(cwd, next, signal.signal, async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }));
    setTimeout(() => signal.abort(), 20);
    await assert.rejects(running);
    await assert.rejects(readFile(join(cwd, next.path)), { code: "ENOENT" });
    assert.throws(() => parsePlan({ decision: "act", reason: "invalid", steps: [{ action: "read_horizon", domain: "training", ...input }], success_condition: { kind: "file_exists", path: input.path } }));
    await assert.rejects(searchLiterature(cwd, { ...input, path: "../outside.json" }, new AbortController().signal, fakeFetch), /LITERATURE_INPUT/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("索引请求拒绝重定向、响应超限与畸形数据", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(providerSearch("crossref", input.query, signal, async (_url, init) => { assert.equal(init!.redirect, "error"); return new Response('x'.repeat(512001)); }), /RESPONSE_LIMIT/);
  await assert.rejects(providerSearch("europepmc", input.query, signal, async () => new Response('{}')), /INVALID_RESPONSE/);
});
