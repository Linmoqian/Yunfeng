/* 任务内模型环境复用、配置失效与取消边界；不产生模型网络请求。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { researchModelEnvironment } from "../src/research/model-environment.js";

test("同任务跨阶段复用模型目录，配置替换后重载，任务重建隔离且取消不返回缓存", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-research-model-environment-"));
  try {
    const cwd = join(root, "project"), agentDir = join(root, "agent");
    await mkdir(join(cwd, ".lin"), { recursive: true }); await mkdir(agentDir);
    const model = (id: string) => JSON.stringify({ providers: { fixture: { api: "openai-completions", apiKey: "fixture-only", baseUrl: "http://127.0.0.1:1/v1", models: [{ id, contextWindow: 32000, maxTokens: 4000 }] } } });
    await writeFile(join(agentDir, "models.json"), model("one"));
    const resources = { skills: [] }, signal = new AbortController().signal;
    const environment = researchModelEnvironment(cwd, agentDir, resources);
    assert.equal(environment, researchModelEnvironment(cwd, agentDir, resources));
    const first = await environment.get(signal);
    assert.equal(first, await environment.get(signal));
    await writeFile(join(agentDir, "replacement.json"), model("two"));
    await rename(join(agentDir, "replacement.json"), join(agentDir, "models.json"));
    const second = await environment.get(signal);
    assert.notEqual(second, first);
    assert.ok((await second.modelRuntime.getAvailable()).some((entry) => entry.id === "two"));
    await writeFile(join(cwd, ".lin/settings.json"), '{"defaultThinkingLevel":"low"}');
    assert.notEqual(await environment.get(signal), second);
    assert.notEqual(environment, researchModelEnvironment(cwd, agentDir, { skills: [] }));
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(environment.get(aborted.signal), { name: "AbortError" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
