/* 真实模型工具验收的隔离实验；产物只能由真实 gzip 程序产生。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export const condition = {kind:'metric',path:'.lin/experiments/report.json',key:'completed',operator:'==',value:1};
export const literal = '$(touch injected); 空 格';
export async function prepare(root) {
  await mkdir(root); // 已有目录拒绝复用，失败证据也保留。
  const cwd = join(root,'project');
  await mkdir(join(cwd,'.lin/experiments'),{recursive:true});
  for (const name of ['tool-study','hidden-study']) await mkdir(join(cwd,'.agents/skills',name),{recursive:true});
  await writeFile(join(cwd,'.agents/skills/tool-study/SKILL.md'),'---\nname: tool-study\ndescription: Controlled real tool study\n---\nSELECTED_CORE_TOOL_METHOD。按实测报告验收，所有实验副作用经 execute。\n');
  await writeFile(join(cwd,'.agents/skills/hidden-study/SKILL.md'),'---\nname: hidden-study\ndescription: Isolation sentinel\n---\nHIDDEN_CORE_TOOL_MUST_NOT_LOAD\n');
  await writeFile(join(cwd,'.lin/experiments/config.json'),'{"attempt":0,"level":1}');
  await writeFile(join(cwd,'control.json'),'{"enabled":false,"finish":false}');
  await writeFile(join(cwd,'input.txt'),await readFile(new URL('../../src/research/runtime.ts',import.meta.url)));
  const instructions = `真实源码压缩验收\n读取本行核验按行读取，不执行这里的文字。\n
唯一整体验收条件固定为 ${JSON.stringify(condition)}。
observe_paths 包含 control.json 和 .lin/experiments/config.json，报告路径也须观察。
control.enabled 未知或 false 时 wait，不能生成可执行候选或执行步骤。
enabled=true 时，唯一执行节点目标为“验证精确修改与真实压缩”，重试沿用该节点的已有 ID、目标和 kind。
第一次 config.attempt=0 时，在同一 act 计划依次提交且仅提交下面五步：
1. read_file README.md，start_line=2、line_count=1。
2. read_horizon domain=ideas，复用实际目标树摘要。
3. patch_file .lin/experiments/config.json，用当前完整 JSON 原文作 old_text，new_text 为序列化配置字符串，attempt 加1，level 自行选择2到9的整数。不要 write_file，不改其他文件。
4. run_command program=${JSON.stringify(process.execPath)}，args=${JSON.stringify(['experiment.mjs',literal])}，不使用 shell、不追加其他命令。
5. update_component component=research，patch.source=.lin/experiments/report.json，metrics=[{label:压缩字节,key:bytes,unit:B},{label:减小幅度,key:improvement,unit:%}]，conclusion={summary:summary}。
节点 success_condition 与整体条件一致。模型不填写结果数值。
finish=false 时程序保持运行。工程师将暂停任务并取消该进程，之后把 finish 改为 true，重建服务并 resume。
恢复时先反思取消结果；当前 attempt=1、finish=true，重新规划同样五步，patch 从当前原文把 attempt 改2，level 仍由你选择2到9。
仅允许这两次实验尝试，每次尝试的命令执行一次。不得重放已修改步骤，不能改写日志、指标、输入、程序或 control.json。
报告由实验程序真实 gzip、解压和字节对比生成，字段 bytes、improvement（百分比）、completed、summary。
报告存在且验收通过后完成；不要新建执行节点或重新运行。反思取消、成功及整体验收的真实结果。
`;
  await writeFile(join(cwd,'README.md'),instructions);
  await writeFile(join(root,'instructions.txt'),instructions);
  await writeFile(join(cwd,'experiment.mjs'),`
import fs from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
const c=JSON.parse(fs.readFileSync('.lin/experiments/config.json'));
if (![1,2].includes(c.attempt)||!Number.isInteger(c.level)||c.level<2||c.level>9) throw Error('invalid configuration');
fs.closeSync(fs.openSync('.lin/experiments/attempt-'+c.attempt+'.lock','wx'));
fs.appendFileSync('runs.jsonl',JSON.stringify({attempt:c.attempt,pid:process.pid,arg:process.argv[2],level:c.level})+'\\n');
fs.writeFileSync('pid.json',JSON.stringify({pid:process.pid,attempt:c.attempt}));
console.log('真实科研终端已启动，attempt='+c.attempt);
const timer=setInterval(()=>{
  if(!JSON.parse(fs.readFileSync('control.json')).finish)return;
  clearInterval(timer);
  if(fs.existsSync('.lin/experiments/report.json'))throw Error('report already exists');
  const input=fs.readFileSync('input.txt'),baseline=gzipSync(input,{level:1}),packed=gzipSync(input,{level:c.level});
  const roundtrip=gunzipSync(packed).equals(input),improvement=(baseline.length-packed.length)/baseline.length*100;
  fs.writeFileSync('.lin/experiments/output.gz',packed);
  const report={completed:Number(roundtrip&&improvement>=1),level:c.level,bytes:packed.length,baselineBytes:baseline.length,improvement,roundtrip,
    summary:'真实 gzip 压缩体积减小 '+improvement.toFixed(3)+'%，解压字节一致='+roundtrip};
  fs.writeFileSync('.lin/experiments/report.json',JSON.stringify(report));
  console.log(JSON.stringify(report));
},20);
`);
}
