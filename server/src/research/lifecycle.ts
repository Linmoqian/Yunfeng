/* 同一科研任务的生命周期命令串行化；失败不阻塞后续停止，关闭时等待已接收的操作。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import type { ResearchCheckpoint } from "./types.js";

/** 作业身份存在但没有同身份终态回执，停止后只能按未知结果处理。 */
export const unresolvedJob = (state: ResearchCheckpoint): boolean => Boolean(state.jobId && (!state.result || state.result.status === "running" || state.result.job_id !== state.jobId));

export class LifecycleLane {
  private readonly pending = new Map<string, Promise<void>>();

  run<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const work = (this.pending.get(id) ?? Promise.resolve()).then(operation);
    const settled = work.then(() => {}, () => {});
    this.pending.set(id, settled);
    void settled.then(() => { if (this.pending.get(id) === settled) this.pending.delete(id); });
    return work;
  }

  async drain(): Promise<void> { await Promise.all(this.pending.values()); }
}
