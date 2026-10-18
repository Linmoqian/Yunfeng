/* 有界 Hook/Event Bus：合并通知、去重并等待当前运行单元释放，禁止模型轮询。
 * Created on 2026-10-19
 * @author: https://github.com/Linmoqian
 */
import type { ResearchCheckpoint } from "../types.js";
import type { HookSignal, ResearchEvent, ResearchHook } from "./types.js";
const hooks: ResearchHook[] = [
  { name: "lifecycle", accept: (e) => e.kind === "lifecycle" ? { started: "任务启动", resumed: "科学家继续任务", recovered: "服务恢复，重新观察项目" }[e.action] : undefined },
  { name: "job", accept: (e, s) => e.kind === "job_completed" && e.status !== "running" && e.jobId === s.jobId && s.result?.job_id === e.jobId && s.result.status === e.status ? `作业${e.status}，需要核验与反馈` : undefined },
  { name: "approval", accept: (e, s) => e.kind === "approval_granted" && !!s.authorizedPlan ? "具体计划已获授权" : undefined },
  { name: "pi", accept: (e) => e.kind === "pi_extension" && e.action === "facts_changed" && e.paths.length > 0 ? "Pi 扩展通知观察文件变化" : undefined },
  { name: "file", accept: (e) => e.kind === "files_changed" && e.paths.length > 0 ? "观察文件内容发生变化" : undefined },
];
export class HookLayer {
  private readonly queue = new Map<string, HookSignal>();
  private readonly seen = new Set<string>();
  private timer?: ReturnType<typeof setTimeout>;
  private immediate = false;
  private closed = false;
  constructor(private readonly read: () => ResearchCheckpoint, private readonly ready: (signals: readonly HookSignal[]) => boolean,
    private readonly trigger: (signals: HookSignal[]) => boolean, private readonly handlers: readonly ResearchHook[] = hooks) {}
  /** 同一通知 ID 仅接收一次；文件通知合并为最多八条路径，队列上限 32。 */
  publish(event: ResearchEvent): boolean {
    if (this.closed || this.seen.has(event.id) || ["PAUSED", "COMPLETED", "FAILED"].includes(this.read().phase)) return false;
    const handler = this.handlers.find((h) => h.accept(event, this.read()) !== undefined);
    if (!handler) return false;
    const key = event.kind === "pi_extension" ? "pi:files" : event.kind === "files_changed" ? "files" : event.kind === "job_completed" ? `job:${event.jobId}` : event.kind === "approval_granted" ? `approval:${event.requestId}` : `lifecycle:${event.action}`;
    if (!this.queue.has(key) && this.queue.size >= 32) return false;
    this.seen.add(event.id);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    const old = this.queue.get(key)?.event;
    const merged = event.kind === "pi_extension" ? { ...event, paths: [...new Set([...(old?.kind === "pi_extension" ? old.paths : []), ...event.paths])].slice(0, 8) } : event.kind === "files_changed" ? { ...event, paths: [...new Set([...(old?.kind === "files_changed" ? old.paths : []), ...event.paths])].slice(0, 8) } : event;
    this.queue.set(key, { hook: handler.name, reason: handler.accept(event, this.read())!, event: merged });
    if (event.kind === "pi_extension") {
      if (!this.immediate) {
        this.immediate = true;
        queueMicrotask(() => { this.immediate = false; this.flush(); });
      }
    } else if (event.kind !== "files_changed") this.flush();
    else if (!this.timer) { this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, 8); this.timer.unref(); }
    return true;
  }
  /** 由运行单元结束或通知触发；繁忙时保留队列，不创建重试定时循环。 */
  flush(): void {
    if (this.closed || !this.queue.size) return;
    const entries = [...this.queue.entries()].filter(([, s]) => this.handlers.some((h) => h.name === s.hook && h.accept(s.event, this.read()) !== undefined));
    const batch = entries.map(([, s]) => s);
    if (batch.length && !this.ready(batch)) return;
    this.queue.clear();
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (batch.length && !this.trigger(batch)) for (const [key, signal] of entries) this.queue.set(key, signal);
  }
  close(): void { this.closed = true; if (this.timer) clearTimeout(this.timer); this.queue.clear(); this.seen.clear(); }
  get pendingCount(): number { return this.queue.size; }
}
