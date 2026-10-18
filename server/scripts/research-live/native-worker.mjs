/* Rust 对照的 Node 工作进程，复用当前生产文件、验收、执行和存储实现。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { readProjectText, evaluate } from '../../dist/research/project.js';
import { ResearchGraphStore } from '../../dist/research/decision/store.js';
import { TaskStore } from '../../dist/task/task-store.js';
import { TaskEventHub } from '../../dist/task/task-event-hub.js';
import { JobExecutor } from '../../dist/research/executor.js';

export async function fixtureHandler(root) {
  const dataDir = join(root, 'data'); await mkdir(dataDir, { recursive: true });
  const seed = JSON.parse(await readFile(join(root, 'task.json'), 'utf8'));
  const graph = new ResearchGraphStore(dataDir); graph.save(seed);
  let at = '2026-10-18T00:00:00.000Z', job = 0;
  const store = new TaskStore({ dataDir, now: () => at }), hub = new TaskEventHub(store), jobs = new JobExecutor();
  return { close: () => jobs.close(), async call(request) {
    at = request.at ?? at;
    switch (request.op) {
      case 'ping': return request.payload;
      case 'read': return readProjectText(root, request.path);
      case 'evaluate': return evaluate(root, request.condition);
      case 'write': return new Promise((resolve, reject) => {
        jobs.start(`native-compare-${job++}`, root, { decision: 'act', reason: 'measure', steps: [{ action: 'write_file', path: request.path, content: request.content }], success_condition: request.condition }, async (result) => {
          if (result.status === 'succeeded') resolve(result.evaluation); else reject(new Error('write rejected'));
        });
      });
      case 'checkpoint': store.update(seed.id, (state) => { state.autonomy.reason = request.reason; }); return null;
      case 'event': return { seq: (await hub.emit(seed.id, 'task_updated', { phase: 'WAITING' })).seq };
      case 'snapshot': return graph.readAll().find((task) => task.id === seed.id);
      default: throw new Error('unsupported fixture operation');
    }
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handler = await fixtureHandler(process.argv[2]);
  process.stdout.write('{"ready":true}\n');
  try {
    for await (const line of createInterface({ input: process.stdin })) {
      if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('request exceeds fixture limit');
      const request = JSON.parse(line), start = performance.now();
      let response;
      try { const value = await handler.call(request); response = { ok: true, value, innerMs: performance.now() - start }; }
      catch { response = { ok: false, code: 'REJECTED', innerMs: performance.now() - start }; }
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } finally { await handler.close(); }
}
