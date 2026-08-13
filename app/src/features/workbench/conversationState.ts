export type ConversationRole = "user" | "assistant" | "tool";
export type MessageStatus = "sending" | "sent" | "failed" | undefined;

export interface ConversationItem {
  id: string;
  role: ConversationRole;
  text: string;
  thinking?: string;
  streaming?: boolean;
  status?: MessageStatus;
}

function contentKey(message: ConversationItem): string {
  return `${message.role}\u0000${message.text}`;
}

/**
 * 服务端快照与本地乐观消息合并。
 *
 * 相同文本可以在一段会话中多次出现，因此按内容去重会误吞后发消息；
 * 这里仅以内容出现次数消除已被服务端确认的那一份本地副本。
 */
export function mergeConversation(current: ConversationItem[], loaded: ConversationItem[]): ConversationItem[] {
  const loadedIds = new Set(loaded.map((message) => message.id));
  const currentCounts = new Map<string, number>();
  const loadedCounts = new Map<string, number>();
  for (const message of current) {
    const key = contentKey(message);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }
  for (const message of loaded) {
    const key = contentKey(message);
    loadedCounts.set(key, (loadedCounts.get(key) ?? 0) + 1);
  }

  const pendingCounts = new Map<string, number>();
  for (const [key, count] of currentCounts) {
    pendingCounts.set(key, Math.max(0, count - (loadedCounts.get(key) ?? 0)));
  }

  return [
    ...loaded,
    ...current.filter((message) => {
      if (loadedIds.has(message.id)) return false;
      const key = contentKey(message);
      const pending = pendingCounts.get(key) ?? 0;
      if (pending === 0) return false;
      pendingCounts.set(key, pending - 1);
      return true;
    }),
  ];
}
