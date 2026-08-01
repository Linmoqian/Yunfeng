// 会话列表与上下文读取：直接读 pi 的 JSONL 会话文件，无需启动 agent。
// 移植自 pi-web lib/session-reader.ts。

import {
  SessionManager,
  buildContextEntries as piBuildContextEntries,
  buildSessionContext as piBuildSessionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { closeSync, openSync, readSync } from "node:fs";
import { normalize as normalizePath } from "node:path";
import type { SessionInfo, SessionContext, SessionMessage } from "./types.js";
import { sessionPathKey } from "./session-path.js";

export { getAgentDir };

declare global {
  var __piSessionPathCache: Map<string, string> | undefined;
  var __piPathToSessionIdCache: Map<string, string> | undefined;
  var __piSessionListPromise: Promise<SessionInfo[]> | undefined;
  var __piSessionListPromiseGeneration: number | undefined;
  var __piSessionListGeneration: number | undefined;
  var __piSessionListCache: { data: SessionInfo[]; ts: number } | undefined;
}

const SESSION_LIST_CACHE_TTL_MS = 30_000;

async function loadAllSessions(): Promise<SessionInfo[]> {
  const piSessions = await SessionManager.listAll();
  const pathToId = new Map<string, string>();
  for (const s of piSessions) pathToId.set(sessionPathKey(s.path), s.id);

  return piSessions.map((s) => {
    cacheSessionPath(s.id, s.path);
    return {
      path: s.path,
      id: s.id,
      cwd: s.cwd,
      name: s.name ?? "",
      created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
      modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage || "(no messages)",
      parentSessionId: s.parentSessionPath ? pathToId.get(sessionPathKey(s.parentSessionPath)) : undefined,
      projectRoot: s.cwd,
    };
  });
}

export function listAllSessions(): Promise<SessionInfo[]> {
  const generation = globalThis.__piSessionListGeneration ?? 0;

  if (globalThis.__piSessionListCache && Date.now() - globalThis.__piSessionListCache.ts < SESSION_LIST_CACHE_TTL_MS) {
    return Promise.resolve(globalThis.__piSessionListCache.data);
  }

  if (globalThis.__piSessionListPromise && globalThis.__piSessionListPromiseGeneration === generation) {
    return globalThis.__piSessionListPromise;
  }

  const loadPromise = loadAllSessions().then((data) => {
    if ((globalThis.__piSessionListGeneration ?? 0) === generation) {
      globalThis.__piSessionListCache = { data, ts: Date.now() };
    }
    return data;
  });
  const trackedPromise = loadPromise.finally(() => {
    if (globalThis.__piSessionListPromise === trackedPromise) {
      globalThis.__piSessionListPromise = undefined;
      globalThis.__piSessionListPromiseGeneration = undefined;
    }
  });

  globalThis.__piSessionListPromise = trackedPromise;
  globalThis.__piSessionListPromiseGeneration = generation;
  return trackedPromise;
}

export function invalidateSessionListCache(): void {
  globalThis.__piSessionListGeneration = (globalThis.__piSessionListGeneration ?? 0) + 1;
  globalThis.__piSessionListCache = undefined;
}

function getPathCache(): Map<string, string> {
  if (!globalThis.__piSessionPathCache) globalThis.__piSessionPathCache = new Map();
  return globalThis.__piSessionPathCache;
}

function getPathToIdCache(): Map<string, string> {
  if (!globalThis.__piPathToSessionIdCache) globalThis.__piPathToSessionIdCache = new Map();
  return globalThis.__piPathToSessionIdCache;
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = getPathCache().get(sessionId);
  if (cached) return cached;
  await listAllSessions();
  return getPathCache().get(sessionId) ?? null;
}

export function cacheSessionPath(sessionId: string, filePath: string): void {
  const normalizedPath = normalizePath(filePath);
  const pathKey = sessionPathKey(normalizedPath);
  const pathCache = getPathCache();
  const reverseCache = getPathToIdCache();
  const previousPath = pathCache.get(sessionId);
  const previousPathKey = previousPath ? sessionPathKey(previousPath) : undefined;
  const previousSessionId = reverseCache.get(pathKey);
  const previousOwnerPath = previousSessionId ? pathCache.get(previousSessionId) : undefined;
  if (previousPathKey && previousPathKey !== pathKey && reverseCache.get(previousPathKey) === sessionId) {
    reverseCache.delete(previousPathKey);
  }
  if (
    previousSessionId &&
    previousSessionId !== sessionId &&
    previousOwnerPath &&
    sessionPathKey(previousOwnerPath) === pathKey
  ) {
    pathCache.delete(previousSessionId);
  }
  pathCache.set(sessionId, normalizedPath);
  reverseCache.set(pathKey, sessionId);
}

export function invalidateSessionPathCache(sessionId: string): void {
  const pathCache = getPathCache();
  const reverseCache = getPathToIdCache();
  const filePath = pathCache.get(sessionId);
  pathCache.delete(sessionId);
  const pathKey = filePath ? sessionPathKey(filePath) : undefined;
  if (pathKey && reverseCache.get(pathKey) === sessionId) {
    reverseCache.delete(pathKey);
  }
}

export function getSessionEntries(filePath: string): unknown[] {
  return SessionManager.open(filePath).getEntries() as unknown as unknown[];
}

export function readSessionHeader(filePath: string): { type?: string; id?: string; cwd?: string; parentSession?: string; timestamp?: string } | null {
  const fd = openSync(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    const maxHeaderBytes = 64 * 1024;
    let position = 0;
    let foundNewline = false;

    while (position < maxHeaderBytes && !foundNewline) {
      const buffer = Buffer.allocUnsafe(Math.min(4096, maxHeaderBytes - position));
      const bytesRead = readSync(fd, buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      const data = buffer.subarray(0, bytesRead);
      const newlineIndex = data.indexOf(0x0a);
      chunks.push(newlineIndex === -1 ? data : data.subarray(0, newlineIndex));
      position += bytesRead;
      foundNewline = newlineIndex !== -1;
    }

    if (!foundNewline && position >= maxHeaderBytes) return null;
    const firstLine = Buffer.concat(chunks).toString("utf8").trimEnd();
    if (!firstLine) return null;
    try {
      const header = JSON.parse(firstLine) as { type?: string };
      return header.type === "session" ? (header as { type?: string; id?: string; cwd?: string; parentSession?: string; timestamp?: string }) : null;
    } catch {
      return null;
    }
  } finally {
    closeSync(fd);
  }
}

function parseEntryTimestamp(timestamp: string): number | undefined {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function entryToUiMessage(entry: Record<string, unknown>): SessionMessage | null {
  switch (entry.type) {
    case "message":
      return entry.message as SessionMessage;
    case "compaction":
      return {
        role: "custom",
        customType: "compaction",
        content: entry.summary,
        display: true,
        details: {
          tokensBefore: entry.tokensBefore,
          firstKeptEntryId: entry.firstKeptEntryId,
        },
        timestamp: parseEntryTimestamp(String(entry.timestamp ?? "")),
      };
    case "branch_summary":
      if (!entry.summary) return null;
      return {
        role: "user",
        content: `*The conversation briefly explored another branch and returned with this summary:*\n\n${entry.summary}`,
        timestamp: parseEntryTimestamp(String(entry.timestamp ?? "")),
      };
    case "custom_message":
      return {
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        display: entry.display,
        details: entry.details,
        timestamp: parseEntryTimestamp(String(entry.timestamp ?? "")),
      };
    default:
      return null;
  }
}

export function buildSessionContext(
  entries: unknown[],
  leafId?: string | null,
  options: { deferThinking?: boolean; deferToolResultImages?: boolean } = {},
): SessionContext {
  const byId = new Map<string, unknown>();
  for (const e of entries as Array<{ id: string }>) byId.set(e.id, e);

  const piEntries = entries as never[];
  const piCtx = piBuildSessionContext(piEntries, leafId ?? null, byId as never);

  const contextEntries = piBuildContextEntries(piEntries, leafId ?? null, byId as never);

  const messages: SessionMessage[] = [];
  const entryIds: string[] = [];
  for (const entry of contextEntries as unknown as Array<{ id: string }>) {
    const localEntry = entry as unknown as Record<string, unknown>;
    let m = entryToUiMessage(localEntry);
    if (m && options.deferToolResultImages && m.role === "toolResult" && Array.isArray(m.content)) {
      const content = m.content as Array<{ type?: string }>;
      if (content.some((b) => b.type === "image")) {
        m = { ...m, content: content.map((b) => (b.type === "image" ? { type: "text", text: "[image omitted]" } : b)) };
      }
    }
    if (m && options.deferThinking && m.role === "assistant" && Array.isArray(m.content)) {
      const content = m.content as Array<{ type?: string; thinking?: string }>;
      if (content.some((b) => b.type === "thinking" && b.thinking?.trim() !== "")) {
        m = {
          ...m,
          content: content.map((b) => (
            b.type === "thinking" && b.thinking?.trim() !== ""
              ? { ...b, thinking: "", deferred: true }
              : b
          )),
        };
      }
    }
    if (m) {
      messages.push(m);
      entryIds.push(localEntry.id as string);
    }
  }

  const model = piCtx.model &&
    typeof piCtx.model === "object" &&
    "provider" in piCtx.model &&
    "id" in piCtx.model
    ? { provider: (piCtx.model as { provider: string }).provider, modelId: (piCtx.model as { id: string }).id }
    : undefined;

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model,
  };
}
