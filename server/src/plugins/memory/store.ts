// MemoryStore：分层记忆的持久化。
// 保存到 ~/.yunfeng/memory/memories.jsonl（追加写）；
// 变更（更新/删除）时整文件重写为临时文件 + renameSync 原子替换。
// 与 task-store 同一模式，不引入新依赖。

import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getYunfengDataDir } from "../../task/task-store.js";
import type { Memory } from "./types.js";

const MEMORY_DIR = "memory";
const MEMORY_FILE = "memories.jsonl";

export function getMemoryDir(dataDir = getYunfengDataDir()): string {
  return path.join(dataDir, MEMORY_DIR);
}

export function memoriesPath(dataDir: string): string {
  return path.join(getMemoryDir(dataDir), MEMORY_FILE);
}

export interface MemoryStoreOptions {
  dataDir?: string;
  now?: () => string;
}

/**
 * MemoryStore 管理 memories.jsonl。
 * 启动时全量载入内存 Map；写操作同步落盘（当前规模完全够用）。
 */
export class MemoryStore {
  private readonly dataDir: string;
  private readonly now: () => string;
  private readonly memories = new Map<string, Memory>();

  constructor(options: MemoryStoreOptions = {}) {
    this.dataDir = options.dataDir ?? getYunfengDataDir();
    this.now = options.now ?? (() => new Date().toISOString());
    const dir = getMemoryDir(this.dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.loadAll();
  }

  private loadAll(): void {
    const file = memoriesPath(this.dataDir);
    if (!existsSync(file)) return;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch (error) {
      console.error(`[memory] 读取记忆文件失败: ${file}`, error instanceof Error ? error.message : error);
      return;
    }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const memory = JSON.parse(line) as Memory;
        if (typeof memory.id !== "string" || typeof memory.kind !== "string") continue;
        this.memories.set(memory.id, memory);
      } catch {
        // 忽略损坏行（不自动丢弃，避免误删用户数据）
      }
    }
  }

  /** 原子重写整个记忆文件。 */
  private persistAll(): void {
    const file = memoriesPath(this.dataDir);
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const lines = [...this.memories.values()]
        .map((memory) => JSON.stringify(memory))
        .join("\n");
      writeFileSync(temp, lines ? `${lines}\n` : "", "utf8");
      renameSync(temp, file);
    } catch (error) {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch { /* ignore */ }
      throw error;
    }
  }

  /** 追加一条新记忆（快速路径：新增不走全量重写）。 */
  append(memory: Memory): void {
    const file = memoriesPath(this.dataDir);
    const dir = path.dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fd = openSync(file, "a");
    try {
      writeSync(fd, `${JSON.stringify(memory)}\n`, null, "utf8");
    } finally {
      closeSync(fd);
    }
    this.memories.set(memory.id, memory);
  }

  get(id: string): Memory | undefined {
    return this.memories.get(id);
  }

  /** 就地变更记忆并原子持久化（确认、遗忘、touch 共用）。 */
  update(id: string, mutate: (memory: Memory) => void): Memory | undefined {
    const memory = this.memories.get(id);
    if (!memory) return undefined;
    mutate(memory);
    memory.lastUsedAt = this.now();
    this.persistAll();
    return memory;
  }

  delete(id: string): boolean {
    const existed = this.memories.delete(id);
    if (existed) this.persistAll();
    return existed;
  }

  findAll(): Memory[] {
    return [...this.memories.values()];
  }
}
