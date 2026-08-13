// 记忆插件入口：声明生命周期钩子、HTTP 路由与上下文单例。
// 设计见 docs/design/plugin-system.md 第 4 节；写入策略为候选 + 自动确认。

import { resolveSessionPath, getSessionEntries } from "../../session-reader.js";
import { getYunfengDataDir } from "../../task/task-store.js";
import type { YunfengPlugin } from "../../plugin/types.js";
import { MemoryStore } from "./store.js";
import { MemoryService } from "./service.js";
import { memoryRoutes } from "./routes.js";

declare global {
  var __yfMemoryContext: { store: MemoryStore; service: MemoryService } | undefined;
}

/** 进程内共享单例（仿 task-context）。测试可注入独立 dataDir。 */
export function getMemoryContext(dataDir?: string): { store: MemoryStore; service: MemoryService } {
  if (!globalThis.__yfMemoryContext) {
    const store = new MemoryStore(dataDir ? { dataDir } : {});
    const service = new MemoryService(store);
    globalThis.__yfMemoryContext = { store, service };
  }
  return globalThis.__yfMemoryContext;
}

/** 测试用：重建上下文（独立数据目录）。 */
export function createMemoryContextForDataDir(dataDir: string): { store: MemoryStore; service: MemoryService } {
  const store = new MemoryStore({ dataDir });
  const service = new MemoryService(store);
  return { store, service };
}

export const memoryPlugin: YunfengPlugin = {
  id: "memory",
  enabled: process.env.YUNFENG_DISABLE_MEMORY_PLUGIN !== "1",

  init() {
    getMemoryContext();
  },

  dispose() {
    // 记忆变更均同步落盘，无需额外清理
  },

  on: {
    /** 会话结束：沉淀一条 episode 候选（同 sessionId 去重）。 */
    async agent_end(event) {
      const { service } = getMemoryContext();
      await depositEpisodeCandidate(service, event.sessionId);
    },
  },

  routes(registrar) {
    const { service } = getMemoryContext();
    const routes = memoryRoutes(service);
    registrar.get("/memory", routes.list);
    registrar.post("/memory", routes.create);
    registrar.patch("/memory/:id", routes.confirm);
    registrar.delete("/memory/:id", routes.forget);
  },
};

const MAX_DEPOSIT_PROMPT_CHARS = 200;

/**
 * 从会话文件读取最后一条用户消息，沉淀 episode 候选记忆。
 * lesson 为占位文案：等 LLM 摘要能力接入后替换为真实教训。
 */
async function depositEpisodeCandidate(
  service: MemoryService,
  sessionId: string,
): Promise<void> {
  try {
    // 同 sessionId 只沉淀一次
    const existing = service.findAll().some(
      (m) => m.kind === "episode" && m.refId === sessionId,
    );
    if (existing) return;

    const prompt = await readLastUserPrompt(sessionId);
    if (!prompt) return;

    service.add(
      {
        kind: "episode",
        content: `完成任务：${prompt.slice(0, MAX_DEPOSIT_PROMPT_CHARS)}`,
        lesson: "完成任务，未记录具体教训（自动沉淀占位，待接入 LLM 摘要）",
      },
      {
        source: "agent_inferred",
        scope: "global",
        refId: sessionId,
      },
    );
    console.log(`[memory] 已沉淀 episode 候选（session ${sessionId}）`);
  } catch (error) {
    console.error(`[memory] 沉淀 episode 失败（session ${sessionId}）:`, error instanceof Error ? error.message : error);
  }
}

async function readLastUserPrompt(sessionId: string): Promise<string | undefined> {
  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return undefined;
  const entries = getSessionEntries(filePath);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } } | undefined;
    if (entry?.type !== "message") continue;
    if (entry.message?.role !== "user") continue;
    const text = textFromContent(entry.message.content);
    if (text?.trim()) return text.trim();
  }
  return undefined;
}

function textFromContent(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}
