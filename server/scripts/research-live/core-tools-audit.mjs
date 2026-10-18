/* 从持久化轨迹独立核对真实模型、四工具、作业身份与两进程恢复。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
const root=resolve(process.argv[2]??'');
assert.ok(process.argv[2]);
const json=async(name)=>JSON.parse(await readFile(join(root,name),'utf8'));
const jsonl=async(name)=>(await readFile(join(root,name),'utf8')).trim().split('\n').map(JSON.parse);
const result=await json('result.json'),first=await json('cancel-checkpoint.json'),last=await json('resume-checkpoint.json');
const trace=await jsonl('trace.jsonl'),requests=trace.filter(r=>r.name==='provider.request'),responses=trace.filter(r=>r.name==='provider.response');
assert.equal(first.id,last.id);assert.equal(first.autonomy.phase,'PAUSED');assert.equal(first.autonomy.result.status,'cancelled');assert.equal(last.autonomy.phase,'COMPLETED');
assert.equal(requests.length,result.providerRequests);assert.equal(responses.length,requests.length);assert.ok(responses.every(r=>r.status===200));
assert.ok(requests.every(r=>r.selected&&!r.hidden&&r.tools===0));
const starts=trace.filter(r=>r.name==='sdk.agent_start'),settled=trace.filter(r=>r.name==='sdk.agent_settled');
assert.equal(starts.length,settled.length);assert.equal(starts.length,requests.length);
assert.equal(new Set(starts.map(r=>r.pid)).size,2);
const modelDone=trace.filter(r=>r.name==='model.done');
assert.equal(modelDone.filter(r=>r.phase==='plan').length,2);assert.equal(modelDone.filter(r=>r.phase==='reflect').length,3);
assert.equal(new Set(modelDone.filter(r=>r.phase==='reflect').map(r=>r.jobId)).size,3);
const quiet=trace.filter(r=>r.name==='quiet.passed');assert.equal(quiet.length,7);assert.ok(quiet.every(r=>r.durationMs>=3000));
const events=await jsonl(`data/tasks/${first.id}/events.jsonl`),snapshots=events.filter(r=>r.type==='task_updated').map(r=>r.data);
const signals=snapshots.flatMap(s=>s.autonomy?.trigger?.signals??[]);
assert.ok(signals.some(s=>s.event.kind==='pi_extension'&&s.event.action==='facts_changed'));
assert.ok(signals.some(s=>s.event.kind==='lifecycle'&&s.event.action==='resumed'));
assert.ok(!signals.some(s=>s.event.kind==='pi_extension'&&['agent_start','agent_settled'].includes(s.event.action)));
const jobs=[...new Set(snapshots.filter(s=>s.autonomy?.phase==='EXECUTING').map(s=>s.autonomy.jobId))];
assert.equal(jobs.length,3);
const episodes=await jsonl('data/memory/memories.jsonl');assert.deepEqual(episodes.map(e=>e.refId).sort(),jobs.sort());
const succeeded=snapshots.find(s=>s.autonomy?.result?.status==='succeeded'&&s.autonomy.plan?.steps.length)?.autonomy.result;
assert.ok(succeeded);assert.ok(succeeded.output.includes('读取本行核验按行读取'));
assert.ok(succeeded.output.includes('"domain":"ideas","available":true'));assert.ok(succeeded.output.includes('真实科研终端已启动'));
assert.ok(succeeded.output.includes('已更新科研组件'));
const tools=trace.filter(r=>r.name==='tool.done');
assert.equal(tools.length,trace.filter(r=>r.name==='tool.start').length);
assert.equal(new Set(tools.map(r=>`${r.mode}:${r.id}`)).size,tools.length);
for(const [tool,weight] of Object.entries({read:1,modify:3,terminal:8,horizon:2})) {
  const rows=tools.filter(r=>r.tool===tool),summary=result.tools[tool];
  assert.equal(summary.calls,rows.length);assert.equal(summary.totalMs,rows.reduce((s,r)=>s+r.elapsedMs,0));
  assert.equal(summary.succeeded,rows.filter(r=>r.outcome==='succeeded').length);
  assert.equal(summary.failed,rows.filter(r=>r.outcome==='failed').length);
  assert.ok(rows.every(r=>Number.isFinite(r.elapsedMs)&&r.elapsedMs>=0&&r.executed));
  assert.ok(trace.filter(r=>r.name==='tool.start'&&r.tool===tool).every(r=>r.weight===weight));
}
assert.equal(result.tools.modify.calls,2);assert.equal(result.tools.terminal.calls,2);assert.equal(result.tools.terminal.failed,1);
assert.equal(result.tools.horizon.calls,3);assert.ok(result.nodeAttempts.length===1&&result.nodeAttempts[0].attempts===2);
assert.deepEqual(result.arbitration,{policy:1,active:0,waiting:0});
const audit={status:'passed',models:[...new Set(requests.map(r=>r.model))],modelCalls:modelDone.length,providerRequests:requests.length,
  sdkLifecyclePairs:starts.length,independentProcesses:2,experimentExecutions:2,jobs:jobs.length,reflections:3,
  quietWindows:quiet.map(r=>r.label),tools:result.tools,report:result.report};
await writeFile(join(root,'audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit));
