import type {
  SessionMessageSnapshot,
  SessionSnapshot,
  SessionUsageSnapshot,
} from "../../services/taskService";

export interface ConversationBranchNode {
  id: string;
  title: string;
  current: boolean;
  children: ConversationBranchNode[];
}

function branchTitle(session: SessionSnapshot): string {
  return session.name?.trim() || session.firstMessage?.trim() || "未命名分支";
}

export function buildConversationBranchTree(
  sessions: SessionSnapshot[],
  currentSessionId: string,
  currentTitle: string,
): ConversationBranchNode[] {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  if (!sessionMap.has(currentSessionId)) {
    sessionMap.set(currentSessionId, {
      id: currentSessionId,
      name: "",
      firstMessage: currentTitle,
      cwd: undefined,
      modified: "",
      messageCount: 0,
    });
  }

  let rootId = currentSessionId;
  const ancestorIds = new Set<string>();
  while (sessionMap.get(rootId)?.parentSessionId && !ancestorIds.has(rootId)) {
    ancestorIds.add(rootId);
    const parentId = sessionMap.get(rootId)?.parentSessionId;
    if (!parentId || !sessionMap.has(parentId)) break;
    rootId = parentId;
  }

  const childrenByParent = new Map<string, SessionSnapshot[]>();
  for (const session of sessionMap.values()) {
    if (!session.parentSessionId || !sessionMap.has(session.parentSessionId)) continue;
    const siblings = childrenByParent.get(session.parentSessionId) ?? [];
    siblings.push(session);
    childrenByParent.set(session.parentSessionId, siblings);
  }

  const visited = new Set<string>();
  function toNode(sessionId: string): ConversationBranchNode | null {
    if (visited.has(sessionId)) return null;
    const session = sessionMap.get(sessionId);
    if (!session) return null;
    visited.add(sessionId);
    const children = (childrenByParent.get(sessionId) ?? [])
      .sort((a, b) => b.modified.localeCompare(a.modified))
      .map((child) => toNode(child.id))
      .filter((child): child is ConversationBranchNode => child !== null);
    return {
      id: session.id,
      title: session.id === currentSessionId && currentTitle.trim() ? currentTitle.trim() : branchTitle(session),
      current: session.id === currentSessionId,
      children,
    };
  }

  const root = toNode(rootId);
  return root ? [root] : [];
}

export function findLatestEffectiveUsage(messages: SessionMessageSnapshot[]): SessionUsageSnapshot | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const usage = message.role === "assistant" ? message.usage : undefined;
    if (usage && (usage.totalTokens ?? 0) > 0) return usage;
  }
  return null;
}

export function getCacheHitPercent(usage?: SessionUsageSnapshot | null): number | null {
  if (!usage) return null;
  const cacheRead = usage.cacheRead ?? 0;
  const totalInput = (usage.input ?? 0) + cacheRead;
  return totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : null;
}

export function formatTokenCount(tokens?: number | null): string {
  if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) return "—";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(tokens));
}

export function formatThinkingLevel(level?: string | null): string {
  const labels: Record<string, string> = {
    off: "关闭",
    minimal: "最小",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
    max: "最高",
  };
  return level ? labels[level] ?? level : "—";
}
