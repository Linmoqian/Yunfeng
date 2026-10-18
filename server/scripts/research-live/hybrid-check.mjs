/* 由 Rust 测试注入真实私有通道，验证 TS 科研编排与 Rust 文件执行，无 LLM。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createTaskContextForDataDir } from '../../dist/task/task-context.js';
import { createMemoryContextForDataDir } from '../../dist/plugins/memory/index.js';
import { ResearchService } from '../../dist/research/service.js';
import { nativeResearchFiles } from '../../dist/research/native-files.js';
import { readProjectText, readProjectFiles, evaluate } from '../../dist/research/project.js';
const root = await realpath(process.argv[2]), cwd = join(root, 'project');
await mkdir(join(cwd, '.lin/experiments'), { recursive: true });
const native = nativeResearchFiles(); assert.ok(native, '必须配置真实 Rust 通道');
// 无效 UTF-8 在 Rust 严格失败，用它排除悄悄走回 Node 的替代路径。
await writeFile(join(cwd, 'invalid.txt'), Buffer.from([255]));
await assert.rejects(readProjectText(cwd, 'invalid.txt'));
// 八个 64 KiB 文本在 JSON 中最坏可膨胀到约 3 MiB，仍须在有界响应内完成。
await writeFile(join(cwd, 'escaped.txt'), '\u0000'.repeat(65536));
const escaped = await readProjectFiles(cwd, Array(8).fill('escaped.txt'));
assert.equal(escaped.length, 8); assert.ok(escaped.every((item) => item.content === '\u0000'.repeat(65536)));
const mixed = await readProjectFiles(cwd, ['invalid.txt', 'missing.txt', 'escaped.txt']);
assert.ok(mixed[0].error && mixed[1].error); assert.equal(mixed[2].content.length, 65536);
await writeFile(join(cwd, 'control.json'), '{"ready":false,"reviewApproved":false}');
await writeFile(join(cwd, 'samples.json'), JSON.stringify(Array.from({ length: 256 }, (_, i) => ({ value: i % 2 ? 4 : 0, keep: i % 2 === 1 }))));
const baseline = '.lin/experiments/baseline.json', report = '.lin/experiments/report.json';
const condition = { kind: 'metric', path: report, key: 'completed', operator: '==', value: 1 };
const plans = [], phases = [];
let reflections = 0;
const reason = async (phase, data) => {
  phases.push(phase);
  if (phase === 'reflect') { reflections++; return { summary: '已核验本地文件产物', knowledge_update: [], next_question: '是否继续？' }; }
  const facts = data.state.facts;
  const fact = (path) => { try { return JSON.parse(facts.find((f) => f.key === `file:${path}`)?.value); } catch { return undefined; } };
  if (phase === 'decide') {
    const control = fact('control.json'), base = fact(baseline);
    const ready = control?.ready && (!base || control.reviewApproved);
    const objective = base ? '筛选统计' : '基线统计';
    return { decision: ready ? 'select' : 'wait', reason: base ? '等待复核' : '等待就绪', mission_condition: condition, observe_paths: ['control.json', 'samples.json', baseline], candidates: ready ? [{ key: base ? 'optimize' : 'baseline', parent: 'mission', objective, kind: 'execute', confidence: 1, cost: 0.1, expected_gain: 0.8 }] : [] };
  }
  const optimize = data.node.objective === '筛选统计'; plans.push(optimize ? 'optimize' : 'baseline');
  const samples = fact('samples.json').filter((sample) => !optimize || sample.keep);
  const sum = samples.reduce((total, sample) => total + sample.value, 0);
  const path = optimize ? report : baseline;
  return { decision: 'act', reason: '固定规则文件试验', steps: [{ action: 'write_file', path, content: JSON.stringify({ count: samples.length, mean: sum / samples.length, completed: 1 }) }], success_condition: { kind: 'file_exists', path } };
};
let context, memory, service;
const start = () => {
  context = createTaskContextForDataDir(join(root, 'data'));
  memory = createMemoryContextForDataDir(join(root, 'data')).service;
  service = new ResearchService(context, memory, () => reason, { analyze: async (tree) => tree });
};
function until(check) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { stop(); const task = context.store.findAll()[0]; reject(new Error(`hybrid phase timeout: ${JSON.stringify({ phase: task?.autonomy?.phase, reason: task?.autonomy?.reason, plans, phases })}`)); }, 15000);
    const inspect = () => {
      const task = context.store.findAll()[0];
      if (task?.autonomy?.phase === 'FAILED') { clearTimeout(deadline); stop(); reject(new Error(task.autonomy.reason)); }
      else if (task && check(task)) { clearTimeout(deadline); stop(); resolve(task); }
    };
    const stop = context.hub.subscribeGlobal(inspect); inspect();
  });
}
start();
try {
  const waiting = until((task) => task.autonomy.phase === 'WAITING');
  const task = await service.create(cwd, '固定规则混合闭环', undefined, {}); await waiting;
  const reviewed = until((task) => task.autonomy.phase === 'WAITING' && task.autonomy.reason === '等待复核');
  await writeFile(join(cwd, 'control.json'), '{"ready":true,"reviewApproved":false}');
  assert.equal(service.notify(task.id, ['control.json']), true); await reviewed;
  assert.deepEqual(plans, ['baseline']);
  await service.pause(task.id, '验证混合执行恢复'); await service.close();
  start();
  assert.equal(context.store.get(task.id).autonomy.phase, 'PAUSED');
  await writeFile(join(cwd, 'control.json'), '{"ready":true,"reviewApproved":true}');
  assert.equal(service.notify(task.id, ['control.json']), false);
  const completed = until((task) => task.autonomy.phase === 'COMPLETED');
  await service.resume(task.id); await completed;
  assert.deepEqual(plans, ['baseline', 'optimize']); assert.ok(reflections >= 2);
  assert.equal((await evaluate(cwd, condition)).passed, true);
  assert.equal(JSON.parse(await native.read(cwd, baseline)).mean, 2);
  assert.equal(JSON.parse(await readFile(join(cwd, report), 'utf8')).mean, 4);
  assert.equal(context.store.get(task.id).autonomy.decision.nodes.filter((n) => n.attempts === 1).length, 2);
  console.log(JSON.stringify({ status: 'hybrid-research-passed', plans, reflections, llmCalls: 0, phases, native: true }));
} finally { await service.close(); }
