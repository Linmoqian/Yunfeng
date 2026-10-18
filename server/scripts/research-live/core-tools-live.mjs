/* 显式付费模型验收：真实 Rust 四工具、授权、取消、SQLite 恢复与逐调用计时。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from 'node:assert/strict';
import { readFile,writeFile,access,realpath } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { createTaskContextForDataDir } from '../../dist/task/task-context.js';
import { createMemoryContextForDataDir } from '../../dist/plugins/memory/index.js';
import { ResearchService } from '../../dist/research/service.js';
import { toolArbiter } from '../../dist/research/tool-arbiter.js';
import { prepare,condition,literal } from './core-tools-fixture.mjs';
import { instrument,summarize } from './core-tools-trace.mjs';
assert.equal(process.env.YUNFENG_RESEARCH_LIVE,'1','必须显式启用真实模型验收');
assert.equal(process.env.YUNFENG_RESEARCH_NATIVE,'3','需要真实 Rust 宿主');
const destination=process.argv[2],mode=process.argv[3];
assert.ok(destination&&['cancel','resume'].includes(mode),'需要新验收目录及 cancel|resume');
if(mode==='cancel')await prepare(resolve(destination));
const root=await realpath(destination),cwd=join(root,'project'),dataDir=join(root,'data');
if(mode==='resume')await assert.rejects(access(join(root,'result.json')),{code:'ENOENT'});
const context=createTaskContextForDataDir(dataDir),memory=createMemoryContextForDataDir(dataDir).service;
const tracked=instrument(root,mode),service=new ResearchService(context,memory,tracked.reasoner);
let task;
const json=async(path)=>JSON.parse(await readFile(join(cwd,path),'utf8'));
const runs=async()=>{try{return (await readFile(join(cwd,'runs.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);}catch(e){if(e.code==='ENOENT')return [];throw e;}};
async function until(check,label) {
  const deadline=Date.now()+600_000;
  while(!await check()) {
    if(['FAILED','PAUSED'].includes(task?.autonomy.phase))throw Error(`${label}: ${task.autonomy.phase} ${task.autonomy.reason}`);
    if(Date.now()>deadline)throw Error(`${label}: timeout`);
    await delay(50);
  }
  tracked.trace('checkpoint',{label,phase:task.autonomy.phase,cycle:task.autonomy.cycle});
}
async function quiet(label) {
  const before={models:tracked.models.length,requests:tracked.requests,cycle:task.autonomy.cycle,runs:await runs()};
  await delay(3000);
  assert.deepEqual({models:tracked.models.length,requests:tracked.requests,cycle:task.autonomy.cycle,runs:await runs()},before,label);
  tracked.trace('quiet.passed',{label,durationMs:3000});
}
async function approve(attempt) {
  await until(()=>Boolean(task.autonomy.approvalId),'等待真实计划授权');
  const plan=task.autonomy.plan,config=await readFile(join(cwd,'.lin/experiments/config.json'),'utf8');
  assert.deepEqual(plan.steps.map(s=>s.action),['read_file','read_horizon','patch_file','run_command','update_component']);
  const [read,horizon,patch,command,component]=plan.steps;
  assert.equal(read.path,'README.md');assert.equal(read.start_line,2);assert.equal(read.line_count,1);
  assert.equal(horizon.domain,'ideas');assert.equal(patch.path,'.lin/experiments/config.json');assert.equal(patch.old_text,config);
  const next=JSON.parse(patch.new_text);assert.equal(next.attempt,attempt);assert.ok(Number.isInteger(next.level)&&next.level>=2&&next.level<=9);
  assert.deepEqual(Object.keys(next).sort(),['attempt','level']);
  assert.equal(command.program,process.execPath);assert.deepEqual(command.args,['experiment.mjs',literal]);
  assert.equal(component.component,'research');assert.equal(component.patch.source,condition.path);assert.deepEqual(plan.success_condition,condition);
  const count=(await runs()).length;await quiet('未授权不执行');
  assert.equal(await readFile(join(cwd,patch.path),'utf8'),config);assert.equal((await runs()).length,count);
  const approval=task.autonomy.approvalId;
  assert.equal(await service.resolve(task.id,approval,true),true);return approval;
}
try {
  if(mode==='cancel') {
    task=await service.create(cwd,await readFile(join(root,'instructions.txt'),'utf8'),undefined,{skills:['tool-study'],maxCycles:12,decisionBudget:3});
    await writeFile(join(root,'task-id.txt'),task.id);
    await until(()=>task.autonomy.phase==='WAITING'&&!task.autonomy.approvalId&&task.autonomy.observation?.facts.some(f=>f.key==='file:control.json'),'等待门控事实');
    await quiet('初始事件等待');
    for(let i=0;i<32;i++)assert.equal(service.notify(task.id,['control.json']),true);
    assert.equal(service.notify(task.id,['.env']),false);await quiet('相同事实通知不调用模型');
    await writeFile(join(cwd,'control.json'),'{"enabled":true,"finish":false}');
    assert.equal(service.notify(task.id,['control.json']),true);
    const approval=await approve(1);
    await until(async()=>{try{return (await json('pid.json')).attempt===1;}catch{return false;}},'Rust PTY 运行中');
    const pid=(await json('pid.json')).pid;
    await service.pause(task.id,'真实模型验收：取消运行中的实验');
    assert.equal(task.autonomy.phase,'PAUSED');assert.equal(task.autonomy.result.status,'cancelled');assert.throws(()=>process.kill(pid,0));
    assert.equal((await runs()).length,1);assert.equal((await runs())[0].arg,literal);
    assert.equal(await service.resolve(task.id,approval,true),false);assert.equal(service.notify(task.id,['control.json']),false);
    await writeFile(join(cwd,'control.json'),'{"enabled":true,"finish":true}');await quiet('暂停期间事实改变不执行');
  }else {
    task=context.store.get(await readFile(join(root,'task-id.txt'),'utf8'));
    assert.equal(task.autonomy.phase,'PAUSED');assert.equal(task.autonomy.result.status,'cancelled');
    service.recover();await quiet('进程重建后不自动执行');
    await service.resume(task.id);await approve(2);
    await until(()=>task.autonomy.phase==='COMPLETED','实验、整体验收和反思完成');
    const report=await json(condition.path),log=await runs();
    assert.equal(report.completed,1);assert.equal(report.roundtrip,true);assert.ok(report.improvement>=1);
    assert.ok(gunzipSync(await readFile(join(cwd,'.lin/experiments/output.gz'))).equals(await readFile(join(cwd,'input.txt'))));
    assert.deepEqual(log.map(r=>r.attempt),[1,2]);assert.ok(log.every(r=>r.arg===literal));
    assert.equal(task.autonomy.component.state.metrics[0].value,report.bytes);assert.equal(task.autonomy.component.result.evaluation.passed,true);
    const episodes=memory.list({projectKey:cwd});assert.equal(episodes.length,3);assert.equal(new Set(episodes.map(e=>e.refId)).size,3);
    await assert.rejects(access(join(cwd,'injected')),{code:'ENOENT'});
    assert.equal(service.notify(task.id,['control.json']),false);await quiet('完成后不追加执行');
    const previous=JSON.parse(await readFile(join(root,'cancel-metrics.json'),'utf8'));
    const allTools=[...previous.tools,...tracked.tools],allModels=[...previous.models,...tracked.models];
    const result={status:'real-core-tools-passed',native:3,report,executions:log,modelCalls:allModels.length,providerRequests:previous.requests+tracked.requests,
      phases:allModels,tools:summarize(allTools),timing:'monotonic wall time; includes arbitration, authorization and native roundtrip',
      arbitration:toolArbiter.status,receipts:toolArbiter.receipts(),nodeAttempts:task.autonomy.decision.nodes.filter(n=>n.attempts).map(n=>({id:n.id,attempts:n.attempts,status:n.status}))};
    assert.ok(Object.values(result.tools).every(row=>row.calls>0));
    assert.equal(result.tools.terminal.calls,2);assert.equal(result.tools.modify.calls,2);
    await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  }
  await writeFile(join(root,`${mode}-checkpoint.json`),JSON.stringify(task,null,2));
}catch(error){if(task)await writeFile(join(root,`${mode}-failed-checkpoint.json`),JSON.stringify(task,null,2));throw error;}
finally {
  try{await service.close();}finally{
    await writeFile(join(root,`${mode}-metrics.json`),JSON.stringify({tools:tracked.tools,models:tracked.models,requests:tracked.requests,summary:summarize(tracked.tools)},null,2));
    tracked.restore();
  }
}
