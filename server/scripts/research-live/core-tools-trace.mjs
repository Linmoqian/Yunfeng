/* 真实 SDK 与工具边界观测；不修改、纠正或替换模型的决策结果。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { piReasoner } from '../../dist/research/reasoner.js';
import { toolArbiter,toolPolicy } from '../../dist/research/tool-arbiter.js';
export function instrument(root,mode) {
  const trace=(name,data={})=>appendFileSync(join(root,'trace.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,mode,name,...data})+'\n');
  const tools=[],models=[],bridges=new WeakSet();
  let requests=0,sequence=0;
  const originalRun=toolArbiter.run;
  toolArbiter.run=async function(call,operation) {
    const id=++sequence,started=performance.now(); let outcome='failed',executed=false;
    trace('tool.start',{id,tool:call.tool,weight:toolPolicy.cost[call.tool]});
    try {
      const result=await originalRun.call(this,call,async()=>{executed=true;return operation();});
      outcome='succeeded';return result;
    } finally {
      const row={id,tool:call.tool,elapsedMs:performance.now()-started,outcome,executed};
      tools.push(row);trace('tool.done',row);
    }
  };
  const reasoner=(cwd,model,resources={})=>{
    const bridge=resources.bridge;
    if(bridge&&!bridges.has(bridge)) {
      bridges.add(bridge);const extension=bridge.extension.bind(bridge);
      bridge.extension=(phase)=>async(pi)=>{
        await extension(phase)(pi);
        pi.on('agent_start',()=>{trace('sdk.agent_start',{phase});});
        pi.on('agent_settled',()=>{trace('sdk.agent_settled',{phase});});
        pi.on('message_end',(event)=>{
          if(event.message.role==='assistant')trace('model.output',{phase,text:event.message.content.filter(c=>c.type==='text').map(c=>c.text).join('')});
        });
        pi.on('before_provider_request',(event)=>{
          const raw=JSON.stringify(event.payload),payload=event.payload;
          const selected=raw.includes('SELECTED_CORE_TOOL_METHOD'),hidden=raw.includes('HIDDEN_CORE_TOOL_MUST_NOT_LOAD');
          requests++;trace('provider.request',{phase,model:payload.model,selected,hidden,tools:payload.tools?.length??0});
          assert.ok(selected&&!hidden);assert.equal(payload.tools?.length??0,0);
        });
        pi.on('after_provider_response',(event)=>{trace('provider.response',{phase,status:event.status});});
      };
    }
    const reason=piReasoner(cwd,model,resources);
    return async(phase,data,signal)=>{
      const started=performance.now();trace('model.start',{phase,jobId:data.result?.job_id,triggers:data.state?.events});
      console.log(JSON.stringify({mode,phase,status:'model-request'}));
      try {
        const value=await reason(phase,data,signal);
        const row={phase,elapsedMs:performance.now()-started,jobId:data.result?.job_id};
        models.push(row);trace('model.done',{...row,value});return value;
      }catch(error){trace('model.failed',{phase,elapsedMs:performance.now()-started,message:error.message});throw error;}
    };
  };
  return {trace,tools,models,reasoner,get requests(){return requests;},restore(){toolArbiter.run=originalRun;}};
}
export function summarize(rows) {
  return Object.fromEntries(['read','modify','terminal','horizon'].map(tool=>{
    const calls=rows.filter(r=>r.tool===tool),sum=calls.reduce((s,r)=>s+r.elapsedMs,0);
    return [tool,{calls:calls.length,succeeded:calls.filter(r=>r.outcome==='succeeded').length,failed:calls.filter(r=>r.outcome==='failed').length,
      dispatched:calls.filter(r=>r.executed).length,totalMs:sum,meanMs:sum/(calls.length||1),maxMs:Math.max(0,...calls.map(r=>r.elapsedMs))}];
  }));
}
