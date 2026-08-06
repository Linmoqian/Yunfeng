// TaskStore：任务领域状态的持久化与事件日志。
// 保存到全局用户目录 ~/.yunfeng/tasks/<task-id>/ 下。
// state.json 采用临时文件加原子重命名；events.jsonl 使用任务内递增 seq 支持断线重放。

import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { TaskEvent, TaskEventName, TaskSource, TaskState } from "./types.js";

const YUNFENG_DIR = ".yunfeng";
const TASKS_DIR = "tasks";

export function getYunfengDataDir(): string {
  const override = process.env.YUNFENG_DATA_DIR;
  if (override) return path.resolve(override);
  return path.join(homedir(), YUNFENG_DIR);
}

export function getTasksDir(dataDir = getYunfengDataDir()): string {
  return path.join(dataDir, TASKS_DIR);
}

function taskDirPath(dataDir: string, taskId: string): string {
  return path.join(getTasksDir(dataDir), taskId);
}

export function statePath(dataDir: string, taskId: string): string {
  return path.join(taskDirPath(dataDir, taskId), "state.json");
}

export function eventsPath(dataDir: string, taskId: string): string {
  return path.join(taskDirPath(dataDir, taskId), "events.jsonl");
}

/** 回读事件日志的最后一个 seq，用于重启后恢复 lastEventSeq。 */
export function readLastEventSeq(dataDir: string, taskId: string): number {
  const file = eventsPath(dataDir, taskId);
  if (!existsSync(file)) return 0;
  let lastSeq = 0;
  let buffer = "";
  try {
    const fd = openSync(file, "r");
    const chunks: Buffer[] = [];
    const maxBytes = 64 * 1024;
    let position = 0;
    while (position < maxBytes) {
      const chunk = Buffer.allocUnsafe(4096);
      const bytesRead = readSync(fd, chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    closeSync(fd);
    buffer = Buffer.concat(chunks).toString("utf8");
  } catch {
    return lastSeq;
  }
  const lines = buffer.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as { seq?: number };
      if (typeof parsed.seq === "number" && parsed.seq > lastSeq) lastSeq = parsed.seq;
    } catch {
      // 忽略损坏行
    }
  }
  return lastSeq;
}



export interface TaskStoreOptions {
  dataDir?: string;
  now?: () => string;
}

export type TaskStateVisitor = (task: TaskState) => void;

/**
 * TaskStore 管理任务目录内的 state.json 与 events.jsonl。
 * 实例共享底层同步文件操作；事件日志追加由 TaskEventHub 调用。
 */
export class TaskStore {
  private readonly dataDir: string;
  private readonly now: () => string;
  private readonly states = new Map<string, TaskState>();
  private readonly seqByTask = new Map<string, number>();

  constructor(options: TaskStoreOptions = {}) {
    this.dataDir = options.dataDir ?? getYunfengDataDir();
    this.now = options.now ?? (() => new Date().toISOString());
    const tasksDir = getTasksDir(this.dataDir);
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    this.loadAll();
  }

  private loadAll(): void {
    const tasksDir = getTasksDir(this.dataDir);
    if (!existsSync(tasksDir)) return;
    let entries: string[];
    try {
      entries = readdirSync(tasksDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const dir = path.join(tasksDir, entry);
      const file = statePath(this.dataDir, entry);
      if (!existsSync(file)) continue;
      try {
        const state = JSON.parse(readFileSync(file, "utf8")) as TaskState;
        if (typeof state.id !== "string" || typeof state.sessionId !== "string") continue;
        if (typeof state.lastEventSeq !== "number") {
          state.lastEventSeq = readLastEventSeq(this.dataDir, state.id);
        }
        this.states.set(state.id, state);
        this.seqByTask.set(state.id, state.lastEventSeq);
      } catch (error) {
        // 损坏状态文件：不自动丢弃，记录为启动警告，跳过该任务。
        console.error(`[yf] 损坏的任务状态文件，跳过加载: ${file}`, error instanceof Error ? error.message : error);
      }
    }
  }

  private persist(state: TaskState): void {
    const dir = taskDirPath(this.dataDir, state.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const target = statePath(this.dataDir, state.id);
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
      renameSync(temp, target);
    } catch (error) {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch { /* ignore */ }
      throw error;
    }
  }

  create(seed: {
    sessionId: string;
    cwd: string;
    title: string;
    source: TaskSource;
  }): TaskState {
    const now = this.now();
    const state: TaskState = {
      schemaVersion: 1,
      id: randomUUID(),
      sessionId: seed.sessionId,
      cwd: seed.cwd,
      title: seed.title.trim() || "未命名任务",
      source: seed.source,
      status: seed.source === "history" ? "completed" : "waiting_input",
      phase: "unknown",
      currentAction: "",
      activeToolNames: [],
      pendingApprovalIds: [],
      createdAt: now,
      updatedAt: now,
      lastEventSeq: 0,
    };
    this.seqByTask.set(state.id, 0);
    this.persist(state);
    this.states.set(state.id, state);
    return state;
  }

  get(taskId: string): TaskState | undefined {
    return this.states.get(taskId);
  }

  findBySession(sessionId: string): TaskState | undefined {
    for (const state of this.states.values()) {
      if (state.sessionId === sessionId) return state;
    }
    return undefined;
  }

  /** 原子更新任务状态；仅当快照仍是当前版本时写入。 */
  update(taskId: string, mutate: (state: TaskState) => void): TaskState | undefined {
    const state = this.states.get(taskId);
    if (!state) return undefined;
    mutate(state);
    state.updatedAt = this.now();
    this.persist(state);
    return state;
  }

  /** 返回下一事件 seq（任务内递增，序列读取时自增）。 */
  reserveSeq(taskId: string): number {
    const current = this.seqByTask.get(taskId) ?? 0;
    const next = current + 1;
    this.seqByTask.set(taskId, next);
    return next;
  }

  appendEvent(event: TaskEvent): void {
    const file = eventsPath(this.dataDir, event.taskId);
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fd = openSync(file, "a");
    try {
      writeSync(fd, `${JSON.stringify(event)}\n`, null, "utf8");
    } finally {
      closeSync(fd);
    }
  }

  readEvents(taskId: string, afterSeq = 0): TaskEvent[] {
    const file = eventsPath(this.dataDir, taskId);
    if (!existsSync(file)) return [];
    const events: TaskEvent[] = [];
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      return events;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as TaskEvent;
        if (typeof event.seq === "number" && event.seq > afterSeq) events.push(event);
      } catch {
        // 忽略损坏行
      }
    }
    return events;
  }

  findAll(): TaskState[] {
    return [...this.states.values()];
  }
}

