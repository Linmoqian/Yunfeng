/* 本地文件 Hook：核对内容后通知，监听持续保留，缺失父目录按创建事件重绑。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import type { TaskState } from "../../task/types.js";
import { observedPaths } from "../context.js";
import { projectPath, readProjectText } from "../project.js";
import { researchEvent, type ResearchEvent } from "./types.js";
const signature = (value: unknown) => typeof value === "string" ? createHash("sha256").update(value).digest("hex") : "unreadable";
export class FileHooks {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly baseline = new Map<string, string>();
  private readonly dirty = new Set<string>();
  private paths: string[] = [];
  private scope = "";
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private scanning: Promise<void> | null = null;
  private rebinding: Promise<void> | null = null;
  private rebindPending = false;
  constructor(private readonly read: () => TaskState, private readonly publish: (event: ResearchEvent) => void,
    private readonly failed: (error: Error) => void) {}
  /** 只在范围或父目录变化时重绑；每次观察快照刷新比较基线。 */
  refresh(force = false): void {
    if (this.closed) return;
    const task = this.read(), paths = observedPaths(task), scope = JSON.stringify(paths);
    const facts = task.autonomy!.observation?.facts ?? [];
    for (const path of paths) {
      const fact = facts.find((f) => f.key === `file:${path}`);
      if (fact) this.baseline.set(path, signature(fact.value));
      else if (!this.baseline.has(path)) this.baseline.set(path, "unreadable");
    }
    if (scope === this.scope && !force) return;
    this.scope = scope; this.paths = paths;
    for (const path of this.baseline.keys()) if (!paths.includes(path)) this.baseline.delete(path);
    for (const path of this.dirty) if (!paths.includes(path)) this.dirty.delete(path);
    this.requestBind();
  }
  private requestBind(): void {
    if (this.closed) return;
    if (this.rebinding) { this.rebindPending = true; return; }
    this.rebinding = this.bind().catch((error) => { if (!this.closed) this.failed(error as Error); }).finally(() => {
      this.rebinding = null;
      if (this.rebindPending) { this.rebindPending = false; this.requestBind(); }
    });
  }
  private async bind(): Promise<void> {
    if (this.closed) return;
    const cwd = this.read().cwd, targets = new Set([cwd]);
    for (const path of this.paths.slice(0, 3)) {
      let target = dirname(await projectPath(cwd, path));
      while (target !== cwd) {
        try { if ((await stat(target)).isDirectory()) break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        target = dirname(target);
      }
      targets.add(target);
    }
    if (this.closed) return;
    for (const target of targets) if (!this.watchers.has(target)) {
      const watcher = watch(target, (_kind, filename) => this.changed(target, filename));
      watcher.on("error", (error) => { if (!this.closed) this.failed(error); });
      this.watchers.set(target, watcher);
    }
    for (const [target, watcher] of this.watchers) if (!targets.has(target)) { watcher.close(); this.watchers.delete(target); }
    // 订阅之后回读一次，关闭观察与建立监听之间的事件间隙。
    this.paths.forEach((path) => this.dirty.add(path)); this.schedule();
  }
  private changed(target: string, filename: string | Buffer | null): void {
    if (this.closed) return;
    const path = filename === null ? null : relative(this.read().cwd, resolve(target, String(filename)));
    const relevant = this.paths.filter((p) => path === null || p === path || p.startsWith(`${path}/`));
    if (!relevant.length) return;
    relevant.forEach((p) => this.dirty.add(p));
    if (path === null || relevant.some((p) => p !== path)) this.refresh(true);
    this.schedule();
  }
  private schedule(): void {
    if (this.closed || this.timer || this.scanning) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.scanning = this.scan().catch((error) => { if (!this.closed) this.failed(error as Error); }).finally(() => {
        this.scanning = null; if (this.dirty.size) this.schedule();
      });
    }, 50);
    this.timer.unref();
  }
  private async scan(): Promise<void> {
    const paths = [...this.dirty]; this.dirty.clear();
    const changed: string[] = [];
    for (const path of paths) {
      let current = "unreadable";
      try { current = signature(await readProjectText(this.read().cwd, path)); } catch { /* 不可读状态由上下文记录，不虚构事实。 */ }
      if (this.closed) return;
      if (this.paths.includes(path) && current !== this.baseline.get(path)) { this.baseline.set(path, current); changed.push(path); }
    }
    if (changed.length) this.publish(researchEvent({ kind: "files_changed", paths: changed }));
  }
  async close(): Promise<void> {
    this.closed = true; if (this.timer) clearTimeout(this.timer);
    this.watchers.forEach((w) => w.close()); this.watchers.clear(); this.dirty.clear();
    await Promise.all([this.scanning, this.rebinding]);
  }
}
