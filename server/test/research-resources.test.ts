/* 科研资源核心回归：选择边界及实际 SDK、扩展通知、实验与重建恢复闭环。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { loadResearchSkills, parseResearchSkills } from "../src/research/skills.js";

async function skill(root: string, name: string, body: string) {
  const path = join(root, name); await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), `---\nname: ${name}\ndescription: Local research test method\n---\n${body}`);
}
test("显式 skill 拒绝越界、缺失、重复和超限，只返回选中内容", async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-research-skills-"));
  try {
    const cwd = join(root, "project"), agent = join(root, "agent");
    await skill(join(cwd, ".agents/skills"), "chosen", "SELECTED_METHOD");
    await skill(join(agent, "skills"), "hidden", "NOT_SELECTED");
    assert.deepEqual(parseResearchSkills(undefined), []);
    assert.throws(() => parseResearchSkills(["../hidden"]));
    assert.throws(() => parseResearchSkills(["chosen", "chosen"]));
    const selected = await loadResearchSkills(cwd, agent, ["chosen"]);
    assert.equal(selected.skills.length, 1); assert.match(selected.prompts.join(""), /SELECTED_METHOD/);
    assert.ok(!selected.prompts.join("").includes("NOT_SELECTED"));
    await assert.rejects(loadResearchSkills(cwd, agent, ["missing"]), /不存在/);
    await skill(join(cwd, ".agents/skills"), "huge", "x".repeat(32769));
    await assert.rejects(loadResearchSkills(cwd, agent, ["huge"]), /32 KiB/);
    await symlink(join(agent, "skills/hidden"), join(cwd, ".agents/skills/escape"));
    await assert.rejects(loadResearchSkills(cwd, agent, ["escape"]), /越出/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("实际 SDK 选择 skill、桥接事件并完成两阶段真实压缩实验及暂停重建恢复", { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "yf-sdk-loop-"));
  const cwd = join(root, "project"), agent = join(root, "agent"), requests: Record<string, unknown>[] = [];
  const condition = { kind: "metric", path: ".lin/experiments/report.json", key: "completed", operator: "==", value: 1 };
  const endpoint = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    const raw = request.messages.at(-1).content;
    const input = JSON.parse(typeof raw === "string" ? raw : raw.map((p: { text?: string }) => p.text ?? "").join(""));
    const context = input.context;
    let value: unknown;
    if (input.phase === "decide") {
      const facts = context.state?.facts ?? [];
      const file = (path: string) => { try { return JSON.parse(facts.find((f: { key: string }) => f.key === `file:${path}`)?.value ?? "null"); } catch { return null; } };
      const control = file("control.json"), baseline = file(".lin/experiments/baseline.json");
      const ready = control?.ready && (!baseline || control.reviewApproved);
      const stage = baseline ? "optimize" : "baseline";
      value = { decision: ready ? "select" : "wait", reason: ready ? "执行可验收实验" : "等待实测前置条件", mission_condition: condition,
        observe_paths: ["control.json", ".lin/experiments/baseline.json", condition.path], mission_presentation: { title: "源码压缩", summary: "以真实字节验证压缩效果" },
        candidates: ready ? [{ key: stage, parent: "mission", objective: stage, kind: "execute", confidence: 0.9, cost: 0.1, expected_gain: 0.8, presentation: { title: stage, summary: "本地压缩实验" } }] : [] };
    } else if (input.phase === "plan") {
      const stage = context.node.objective, path = stage === "baseline" ? ".lin/experiments/baseline.json" : condition.path;
      value = { decision: "act", reason: "通过 execute 运行压缩", steps: [
        { action: "write_file", path: ".lin/experiments/config.json", content: JSON.stringify({ stage, level: stage === "baseline" ? 1 : 9 }) },
        { action: "run_command", program: process.execPath, args: ["benchmark.mjs"] },
        { action: "update_component", component: "research", patch: { source: path, metrics: [{ label: "压缩字节", key: "bytes" }], conclusion: { summary: "summary" } } },
      ], success_condition: { kind: "file_exists", path }, observe_paths: ["control.json", ".lin/experiments/baseline.json", condition.path] };
    } else value = { summary: "本轮已执行并核验，具体指标见实验报告。", knowledge_update: [{ key: "gzip", value: "已保存本地实验结果" }], next_question: "是否满足长期验收？" };
    const frame = (delta: object, finish_reason: string | null) => `data: ${JSON.stringify({ id: "stub", object: "chat.completion.chunk", created: 0, model: "research-local", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(frame({ role: "assistant", content: JSON.stringify(value) }, null) + frame({}, "stop") + "data: [DONE]\n\n");
  });
  try {
    await mkdir(join(cwd, ".lin/experiments"), { recursive: true }); await mkdir(agent, { recursive: true });
    await skill(join(cwd, ".agents/skills"), "gzip-study", "SELECTED_GZIP_METHOD：先测基线，再优化并检验解压字节一致；所有动作经过 execute。");
    await skill(join(agent, "skills"), "hidden", "HIDDEN_SKILL_MARKER");
    await mkdir(join(cwd, ".lin/extensions"));
    await writeFile(join(cwd, ".lin/extensions/unsafe.ts"), `throw new Error('UNSELECTED_EXTENSION_RAN');`);
    await writeFile(join(agent, "settings.json"), JSON.stringify({ packages: ["/nonexistent/research-should-not-resolve-packages"] }));
    await writeFile(join(cwd, "control.json"), '{"ready":false,"reviewApproved":false}');
    await writeFile(join(cwd, "README.md"), "本地源码 gzip 基线和优化，产物由 benchmark 写入，人工修改 control 复核。");
    await writeFile(join(cwd, "input.txt"), await readFile(new URL("../src/research/runtime.ts", import.meta.url)));
    await writeFile(join(cwd, "benchmark.mjs"), `import { readFileSync,writeFileSync,appendFileSync } from 'node:fs';
import { gzipSync,gunzipSync } from 'node:zlib';
const config=JSON.parse(readFileSync('.lin/experiments/config.json','utf8'));
const input=readFileSync('input.txt'), compressed=gzipSync(input,{level:config.level});
const roundtrip=gunzipSync(compressed).equals(input);
const baseline=config.stage==='baseline'?null:JSON.parse(readFileSync('.lin/experiments/baseline.json','utf8'));
const improvement=baseline?100*(1-compressed.length/baseline.bytes):0;
const report={bytes:compressed.length,roundtrip,improvement,completed:baseline&&roundtrip&&improvement>=1?1:0,summary:config.stage+' 字节 '+compressed.length};
writeFileSync('.lin/experiments/'+(baseline?'report':'baseline')+'.json',JSON.stringify(report));
appendFileSync('runs.log',config.stage+'\\n');console.log(JSON.stringify(report));`);
    await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
    const port = (endpoint.address() as { port: number }).port;
    await writeFile(join(agent, "models.json"), JSON.stringify({ providers: { researchlocal: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "local-test-only", models: [{ id: "research-local", contextWindow: 32000, maxTokens: 4000 }] } } }));
    const env = join(root, "empty.env"); await writeFile(env, "");
    const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "test/fixtures/research-sdk-loop.ts", cwd, join(root, "data")], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, YUNFENG_ENV_FILE: env, YUNFENG_AGENT_DIR: agent, YUNFENG_DATA_DIR: join(root, "data") }, timeout: 35000,
    });
    assert.match(child.stdout, /sdk-research-loop-ok/);
    for (const request of requests) {
      assert.ok(!request.tools || (request.tools as unknown[]).length === 0);
      assert.match(JSON.stringify(request), /SELECTED_GZIP_METHOD/);
      assert.ok(!JSON.stringify(request).includes("HIDDEN_SKILL_MARKER"));
    }
    console.log(child.stdout.trim());
  } finally { endpoint.closeAllConnections(); await new Promise<void>((resolve) => endpoint.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
