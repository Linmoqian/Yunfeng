// 会话列表与上下文读取：直接读 pi 的 JSONL 会话文件，无需启动 agent。
// 与 pi CLI 共享同一份数据（~/.pi/agent/sessions/）。

import {
  buildContextEntries,
  buildSessionContext,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { SessionInfo, SessionContext, SessionMessage } from "./types";

let listCache: { data: SessionInfo[]; ts: number } | null = null;
let listPromise: Promise<SessionInfo[]> | null = null;
let listGeneration = 0;

const LIST_CACHE_TTL_MS = 30_000;

const pathToId = new Map<string, string>();
const idToPath = new Map<string, string>();

function sessionPathKey(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

async function loadAllSessions(): Promise<SessionInfo[]> {
  const piSessions = await SessionManager.listAll();
  pathToId.clear();
  idToPath.clear();
  for (const s of piSessions) {
    pathToId.set(sessionPathKey(s.path), s.id);
    idToPath.set(s.id, s.path);
  }
  return piSessions.map((s) => ({
    path: s.path,
    id: s.id,
    cwd: s.cwd,
    name: s.name ?? "",
    created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
    modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
    messageCount: s.messageCount,
    firstMessage: s.firstMessage || "(no messages)",
    parentSessionId: s.parentSessionPath
      ? pathToId.get(sessionPathKey(s.parentSessionPath))
      : undefined,
    projectRoot: s.cwd,
  }));
}

export function invalidateSessionList(): void {
  listGeneration += 1;
  listCache = null;
}

export async function listAllSessions(): Promise<SessionInfo[]> {
  if (listCache && Date.now() - listCache.ts < LIST_CACHE_TTL_MS) {
    return listCache.data;
  }
  if (!listPromise) {
    const generation = listGeneration;
    listPromise = loadAllSessions().then((data) => {
      if (generation === listGeneration) {
        listCache = { data, ts: Date.now() };
      }
      return data;
    });
  }
  try {
    return await listPromise;
  } finally {
    listPromise = null;
  }
}

export async function resolveSessionPath(sessionId: string): Promise<string | null> {
  const cached = idToPath.get(sessionId);
  if (cached) return cached;
  await listAllSessions();
  return idToPath.get(sessionId) ?? null;
}

export function getSessionEntries(filePath: string): unknown[] {
  return SessionManager.open(filePath).getEntries() as unknown as unknown[];
}

export async function readSessionContext(
  sessionId: string,
  leafId?: string | null,
): Promise<SessionContext | null> {
  const filePath = await resolveSessionPath(sessionId);
  if (!filePath) return null;
  const manager = SessionManager.open(filePath);
  const entries = manager.getEntries();

  const piEntries = entries as never[];
  const byId = new Map<string, unknown>();
  for (const e of entries as Array<{ id: string }>) byId.set(e.id, e);

  const piCtx = buildSessionContext(
    piEntries,
    leafId ?? null,
    byId as never,
  );

  const contextEntries = buildContextEntries(
    piEntries,
    leafId ?? null,
    byId as never,
  );

  const messages: SessionContext["messages"] = [];
  const entryIds: string[] = [];
  for (const entry of contextEntries as unknown as Array<{ id: string; message?: unknown; type: string }>) {
    const m = entryToUiMessage(entry);
    if (m) {
      messages.push(m);
      entryIds.push(entry.id);
    }
  }

  const model =
    piCtx.model && typeof piCtx.model === "object" && "provider" in piCtx.model && "id" in piCtx.model
      ? {
          provider: (piCtx.model as { provider: string }).provider,
          modelId: (piCtx.model as { id: string }).id,
        }
      : undefined;

  return {
    messages,
    entryIds,
    thinkingLevel: piCtx.thinkingLevel,
    model,
  };
}

function entryToUiMessage(entry: {
  type: string;
  message?: unknown;
  summary?: string;
  tokensBefore?: number;
  firstKeptEntryId?: string;
  customType?: string;
  content?: unknown;
  display?: boolean;
  details?: unknown;
  timestamp?: string;
}): SessionMessage | null {
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
        timestamp: entry.timestamp,
      };
    case "branch_summary":
      if (!entry.summary) return null;
      return {
        role: "user",
        content: `*The conversation briefly explored another branch and returned with this summary:*\n\n${entry.summary}`,
        timestamp: entry.timestamp,
      };
    case "custom_message":
      return {
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        display: entry.display,
        details: entry.details,
        timestamp: entry.timestamp,
      };
    default:
      return null;
  }
}

export { getAgentDir };
