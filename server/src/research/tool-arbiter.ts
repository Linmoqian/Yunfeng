/* 工具调用仲裁：宿主固定成本、有界等待、资源互斥与取消，不改变计划顺序。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
export type CoreTool = "read" | "modify" | "terminal" | "horizon";
type Resource = { key: string; write: boolean };
export interface ToolCall { tool: CoreTool; resources: Resource[]; bytes?: number; signal?: AbortSignal; authorize?: () => Promise<void> }
type Pending = { call: ToolCall; score: number; at: number; start: () => void; detach: () => void };
type Scope = Pick<ToolCall, "signal" | "authorize">;
const scopes = new AsyncLocalStorage<Scope>();
export const withToolScope = <T>(scope: Scope, operation: () => Promise<T>) => scopes.run(scope, operation);
// v1 是可解释的相对成本策略，数值不是性能实测；模型不能传入权重或优先级。
const cost = { read: 1, modify: 3, terminal: 8, horizon: 2 };
export const toolPolicy = { version: 1, cost, maxActive: 8, maxQueued: 32 } as const;
export interface ToolReceipt { tool: CoreTool; score: number; waitMs: number; elapsedMs: number; outcome: "succeeded" | "failed" }
const overlaps = (a: Resource[], b: Resource[]) => a.some((x) => b.some((y) => x.key === y.key && (x.write || y.write)));

/** 公共队列只调度已就绪的调用；等待可取消，已提交操作须由执行器负责取消和核验。 */
export class ToolArbiter {
  private readonly pending: Pending[] = [];
  private readonly running = new Set<Pending>();
  private scheduled = false;
  private readonly recent: ToolReceipt[] = [];
  constructor(private readonly now = () => performance.now()) {}
  get status() { return { policy: toolPolicy.version, active: this.running.size, waiting: this.pending.length }; }
  receipts() { return this.recent.map((r) => ({ ...r })); }
  async run<T>(input: ToolCall, operation: () => Promise<T>): Promise<T> {
    const scope = scopes.getStore();
    const call = { ...input, signal: scope?.signal && input.signal ? AbortSignal.any([scope.signal, input.signal]) : scope?.signal ?? input.signal,
      authorize: async () => { await scope?.authorize?.(); await input.authorize?.(); } };
    call.signal?.throwIfAborted();
    await call.authorize();
    call.signal?.throwIfAborted();
    if (this.pending.length >= toolPolicy.maxQueued) return Promise.reject(new Error("TOOL_LIMIT：工具等待容量已满"));
    return new Promise<T>((resolveResult, reject) => {
      const abort = () => {
        const index = this.pending.indexOf(item);
        if (index >= 0) { this.pending.splice(index, 1); item.detach(); reject(new Error("TOOL_CANCELLED：调用在提交前取消")); this.schedule(); }
      };
      const item: Pending = { call, score: -(cost[call.tool] + Math.min(8, (call.bytes ?? 0) / 65536)), at: this.now(),
        detach: () => call.signal?.removeEventListener("abort", abort),
        start: () => { const started = this.now(); let outcome: ToolReceipt["outcome"] = "failed"; void (async () => {
          try {
            call.signal?.throwIfAborted();
            await call.authorize?.();
            call.signal?.throwIfAborted();
            const value = await operation();
            call.signal?.throwIfAborted();
            outcome = "succeeded";
            resolveResult(value);
          } catch (error) { reject(error); }
          finally {
            this.recent.push({ tool: call.tool, score: item.score, waitMs: started - item.at, elapsedMs: this.now() - started, outcome });
            if (this.recent.length > 64) this.recent.shift();
            this.running.delete(item); item.detach(); this.schedule();
          }
        })(); },
      };
      this.pending.push(item); call.signal?.addEventListener("abort", abort, { once: true }); this.schedule();
    });
  }
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.drain(); });
  }
  private drain() {
    const priority = (p: Pending) => p.score + Math.min(10, (this.now() - p.at) / 1000);
    this.pending.sort((a, b) => priority(b) - priority(a));
    for (let index = 0; index < this.pending.length && this.running.size < toolPolicy.maxActive;) {
      const item = this.pending[index]!;
      if ([...this.running].some((p) => overlaps(p.call.resources, item.call.resources))) { index++; continue; }
      this.pending.splice(index, 1); this.running.add(item); item.start();
    }
  }
}
export const toolArbiter = new ToolArbiter();
/** 读取允许共存；同项目的修改与实验命令互斥，文件级锁防止修改穿过在途读取。 */
export function toolResources(cwd: string, paths: readonly string[], write = false): Resource[] {
  return [...(write ? [{ key: `mutation:${resolve(cwd)}`, write: true }] : []), ...paths.map((path) => ({ key: `file:${resolve(cwd, path)}`, write }))];
}
