// MemoryService：分层记忆的业务接口（写入/检索/确认/遗忘）。
// 写入策略：user_explicit 直接 confirmed；agent_inferred / observed 落 candidate，
// useCount 达到阈值（3 次）自动转 confirmed。

import { randomUUID } from "node:crypto";
import type { MemoryStore } from "./store.js";
import {
  CONFIRMED_USE_COUNT_THRESHOLD,
  type Memory,
  type MemoryConfidence,
  type MemoryKind,
  type MemoryScope,
  type MemorySource,
  type NewMemory,
} from "./types.js";

export interface AddMemoryOptions {
  source?: MemorySource;
  scope?: MemoryScope;
  projectKey?: string;
  topics?: string[];
  /** 来源引用（如 sessionId），用于去重与追溯 */
  refId?: string;
  /** 测试/导入用：固定 id */
  id?: string;
}

export interface RetrieveOptions {
  topics?: string[];
  projectKey?: string;
  limit?: number;
  kinds?: MemoryKind[];
}

export interface ListOptions {
  kind?: MemoryKind;
  confidence?: MemoryConfidence;
  q?: string;
  projectKey?: string;
}

export class MemoryService {
  constructor(private readonly store: MemoryStore) {}

  /** 写入一条记忆；user_explicit 直接确认，其余落候选。 */
  add(input: NewMemory, options: AddMemoryOptions = {}): Memory {
    const now = new Date().toISOString();
    const source = options.source ?? "agent_inferred";
    const base = {
      id: options.id ?? randomUUID(),
      content: input.content.trim(),
      source,
      scope: options.scope ?? "global",
      confidence: (source === "user_explicit" ? "confirmed" : "candidate") as MemoryConfidence,
      topics: dedupe(options.topics ?? extractTopics(input.content)),
      projectKey: options.projectKey,
      refId: options.refId,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
      schemaVersion: 1 as const,
    };
    const memory: Memory =
      input.kind === "procedure"
        ? { ...base, kind: "procedure", steps: input.steps }
        : input.kind === "episode"
          ? { ...base, kind: "episode", lesson: input.lesson }
          : { ...base, kind: input.kind };
    this.store.append(memory);
    return memory;
  }

  /** 检索相关记忆：topics 为强过滤，projectKey 为范围过滤，按置信度/项目/新鲜度排序。 */
  retrieve(options: RetrieveOptions = {}): Memory[] {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const topics = options.topics ?? [];
    const projectKey = options.projectKey;

    let memories = this.store.findAll();
    if (options.kinds?.length) {
      const kinds = new Set(options.kinds);
      memories = memories.filter((m) => kinds.has(m.kind));
    }
    if (projectKey) {
      memories = memories.filter((m) => m.scope === "global" || m.projectKey === projectKey);
    }
    if (topics.length > 0) {
      const topicSet = new Set(topics);
      memories = memories.filter((m) => m.topics.some((t) => topicSet.has(t)));
    }

    memories.sort((a, b) => rank(b, topics, projectKey) - rank(a, topics, projectKey));
    return memories.slice(0, limit);
  }

  /** 列出记忆（管理界面用），按更新时间倒序。 */
  list(options: ListOptions = {}): Memory[] {
    let memories = this.store.findAll();
    if (options.kind) memories = memories.filter((m) => m.kind === options.kind);
    if (options.confidence) memories = memories.filter((m) => m.confidence === options.confidence);
    if (options.projectKey) {
      memories = memories.filter((m) => m.scope === "global" || m.projectKey === options.projectKey);
    }
    if (options.q) {
      const needle = options.q.toLowerCase();
      memories = memories.filter((m) =>
        m.content.toLowerCase().includes(needle) ||
        m.topics.some((t) => t.toLowerCase().includes(needle)),
      );
    }
    memories.sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
    return memories;
  }

  /** 显式确认记忆（candidate → confirmed）。 */
  confirm(id: string): Memory | undefined {
    const memory = this.store.get(id);
    if (!memory) return undefined;
    if (memory.confidence === "confirmed") return memory;
    return this.store.update(id, (m) => {
      m.confidence = "confirmed";
    });
  }

  /** 遗忘（永久删除）记忆。 */
  forget(id: string): boolean {
    return this.store.delete(id);
  }

  /** 标记一次使用：useCount 递增，达到阈值自动转 confirmed。返回更新后的记忆。 */
  touch(id: string, extraTopics: string[] = []): Memory | undefined {
    const memory = this.store.get(id);
    if (!memory) return undefined;
    return this.store.update(id, (m) => {
      m.useCount += 1;
      if (m.confidence === "candidate" && m.useCount >= CONFIRMED_USE_COUNT_THRESHOLD) {
        m.confidence = "confirmed";
      }
      if (extraTopics.length > 0) {
        m.topics = dedupe([...m.topics, ...extraTopics]);
      }
    });
  }

  get(id: string): Memory | undefined {
    return this.store.get(id);
  }

  findAll(): Memory[] {
    return this.store.findAll();
  }
}

/** 排序评分：置信度 > 项目匹配 > 主题匹配（均为加性权重）。 */
function rank(memory: Memory, topics: string[], projectKey?: string): number {
  let score = 0;
  if (memory.confidence === "confirmed") score += 1000;
  if (projectKey && memory.scope === "project" && memory.projectKey === projectKey) score += 500;
  if (topics.length > 0) {
    const topicSet = new Set(topics);
    score += memory.topics.filter((t) => topicSet.has(t)).length * 100;
  }
  return score;
}

/** 主题提取：中文/英文单词切分（第一版简单实现，不做 NLP）。 */
function extractTopics(content: string): string[] {
  const tokens = content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 24);
  return dedupe(tokens.slice(0, 16));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
