/* 真实 Rust 通道下的工具授权、精确修改、PTY 取消与恢复；不请求模型。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { createTaskContextForDataDir } from '../../dist/task/task-context.js';
import { createMemoryContextForDataDir } from '../../dist/plugins/memory/index.js';
import { ResearchService } from '../../dist/research/service.js';
import { terminalConnection } from '../../dist/agent/terminal-client.js';
import { toolArbiter } from '../../dist/research/tool-arbiter.js';
const root = await realpath(process.argv[2]), cwd = join(root, 'project');
assert.equal(process.env.YUNFENG_RESEARCH_NATIVE, '3');
await mkdir(join(cwd, '.lin/experiments'), { recursive: true });
await writeFile(join(cwd, 'README.md'), '真实本地工具验收\n参数必须保持字面值\n');
await writeFile(join(cwd, '.lin/experiments/config.json'), '{"level":1}');
await writeFile(join(cwd, 'control.json'), '{"ready":false}');
await writeFile(join(cwd, 'experiment.mjs'), `
import fs from 'node:fs';
fs.appendFileSync('runs.log', 'run\\n');
fs.writeFileSync('pid.json', JSON.stringify({pid:process.pid,arg:process.argv[2]}));
const timer = setInterval(() => {
  if (!JSON.parse(fs.readFileSync('control.json')).ready) return;
  clearInterval(timer);
  const config = JSON.parse(fs.readFileSync('.lin/experiments/config.json'));
  fs.writeFileSync('.lin/experiments/report.json', JSON.stringify({completed:1,level:config.level,summary:'参数与产物已核验'}));
  console.log('科研终端真实输出', config.level);
}, 20);
`);
const context = createTaskContextForDataDir(join(root, 'data'));
const memory = createMemoryContextForDataDir(join(root, 'data')).service;
const condition = { kind:'metric', path:'.lin/experiments/report.json', key:'completed', operator:'==', value:1 };
const literal = '$(touch injected); 空 格', args = ['experiment.mjs', literal];
let plans = 0, reflections = 0;
const reflectedJobs = [];
const reason = async (phase, data) => {
  if (phase === 'reflect') { reflections++; reflectedJobs.push(data.result.job_id); return {summary:'核验实际作业结果',knowledge_update:[],next_question:''}; }
  if (phase === 'decide') {
    const node = data.tree.nodes.find((n) => n.kind === 'execute');
    return {decision:'select',reason:'验证受控工具',mission_condition:condition,observe_paths:['control.json'],
      candidates:[{key:node?.id ?? 'experiment',parent:'mission',objective:'核验真实工具',kind:'execute',confidence:1,cost:0.1,expected_gain:1}]};
  }
  plans++;
  return {decision:'act',reason:'精确配置并执行',steps:[
    {action:'read_file',path:'README.md',start_line:2,line_count:1},
    {action:'read_horizon',domain:'ideas'},
    {action:'patch_file',path:'.lin/experiments/config.json',old_text:plans === 1 ? '1' : '9',new_text:plans === 1 ? '9' : '7'},
    {action:'run_command',program:process.execPath,args},
    {action:'update_component',component:'research',patch:{source:condition.path,metrics:[{label:'参数',key:'level'}],conclusion:{summary:'summary'}}},
  ],success_condition:condition};
};
const service = new ResearchService(context,memory,() => reason,{analyze:async (tree) => tree});
async function until(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(10);
  }
  throw new Error(`core tools timeout: ${JSON.stringify(context.store.findAll().map((t) => ({phase:t.autonomy?.phase,reason:t.autonomy?.reason})))}`);
}
let task;
try {
  task = await service.create(cwd,'真实工具闭环',undefined,{});
  await until(() => task.autonomy.approvalId);
  assert.equal(await readFile(join(cwd,'.lin/experiments/config.json'),'utf8'), '{"level":1}');
  await assert.rejects(readFile(join(cwd,'runs.log')), {code:'ENOENT'});
  const approval = task.autonomy.approvalId;
  assert.equal(await service.resolve(task.id,approval,true),true);
  await until(async () => { try { return JSON.parse(await readFile(join(cwd,'pid.json'),'utf8')).pid > 0; } catch { return false; } });
  const pid = JSON.parse(await readFile(join(cwd,'pid.json'),'utf8')).pid;
  await service.pause(task.id,'验证运行中暂停');
  assert.equal(task.autonomy.phase,'PAUSED'); assert.equal(task.autonomy.result.status,'cancelled');
  assert.throws(() => process.kill(pid,0));
  assert.equal(JSON.parse(await readFile(join(cwd,'pid.json'),'utf8')).arg,literal);
  assert.equal((await readFile(join(cwd,'runs.log'),'utf8')).trim().split('\n').length,1);
  assert.equal(await service.resolve(task.id,approval,true),false);
  await writeFile(join(cwd,'control.json'),'{"ready":true}');
  await service.resume(task.id);
  await until(() => task.autonomy.approvalId);
  assert.equal(plans,2); // 恢复先反思取消结果，再生成新计划；旧步骤没有重放。
  assert.equal(await service.resolve(task.id,task.autonomy.approvalId,true),true);
  await until(() => task.autonomy.phase === 'COMPLETED');
  const report = JSON.parse(await readFile(join(cwd,condition.path),'utf8'));
  assert.equal(report.level,7); assert.equal(report.completed,1);
  assert.equal((await readFile(join(cwd,'runs.log'),'utf8')).trim().split('\n').length,2);
  assert.equal(reflections,3); assert.equal(new Set(reflectedJobs).size,3); assert.equal(task.autonomy.component.state.metrics[0].value,7);
  assert.ok(toolArbiter.receipts().some((r) => r.tool === 'terminal' && r.outcome === 'succeeded'));
  await assert.rejects(readFile(join(cwd,'injected')), {code:'ENOENT'});

  // 模拟 Node 异常退出后的未知作业：Rust 宿主仍存活，只按作业身份回收，不重启。
  const orphan = context.store.create({cwd,sessionId:'orphan',title:'恢复核对',source:'task'});
  context.store.update(orphan.id,(s) => {
    s.mode='research'; s.autonomy={...structuredClone(task.autonomy),phase:'WAITING',jobId:'orphan',result:undefined,lastResult:undefined};
  });
  const call = terminalConnection();
  await call({action:'run',cwd,program:process.execPath,args:['-e',"require('node:fs').writeFileSync('orphan.pid',String(process.pid));setInterval(()=>{},1000)"],jobId:'orphan:0'});
  await until(async () => { try { return Number(await readFile(join(cwd,'orphan.pid'),'utf8')) > 0; } catch { return false; } });
  const orphanPid = Number(await readFile(join(cwd,'orphan.pid'),'utf8'));
  service.recover(); await service.pause(orphan.id,'核对恢复结果');
  assert.equal(orphan.autonomy.result.status,'interrupted');
  assert.throws(() => process.kill(orphanPid,0));
  console.log(JSON.stringify({status:'core-tools-passed',plans,reflections,executions:2,llmCalls:0,authorization:true,cancelled:true,recovered:true,tools:[...new Set(toolArbiter.receipts().map((r) => r.tool))]}));
} finally { await service.close(); }
