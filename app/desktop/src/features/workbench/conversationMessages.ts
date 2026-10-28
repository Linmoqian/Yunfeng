/* 将 Pi 会话消息和工具结果还原为对话条目。
 * Created on 2026-10-28
 * @author: https://github.com/Linmoqian
 */
import type { ConversationItem, ConversationRole } from "./conversationState";
import type { ToolCallInfo } from "./toolFeedback";

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const candidate = block as { type?: string; text?: string; thinking?: string; content?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") return candidate.text;
      if (candidate.type === "thinking") return "";
      return typeof candidate.content === "string" ? candidate.content : "";
    }).filter(Boolean).join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function contentToThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (!block || typeof block !== "object") return "";
    const candidate = block as { type?: string; thinking?: string };
    return candidate.type === "thinking" && typeof candidate.thinking === "string" ? candidate.thinking : "";
  }).filter(Boolean).join("");
}

export function normalizeConversationMessage(message: unknown, index: number): ConversationItem | null {
  const candidate = message as { id?: string; role?: string; content?: unknown };
  const text = contentToText(candidate.content).trim();
  const thinking = contentToThinking(candidate.content).trim();
  if (!text && !thinking) return null;
  const role: ConversationRole = candidate.role === "user" ? "user" : candidate.role === "assistant" ? "assistant" : "tool";
  return {
    id: candidate.id ?? `${role}-${index}`,
    role,
    text,
    ...(thinking ? { thinking } : {}),
  };
}

/** 从 Pi 会话记录恢复调用及对应结果，保持调用所处的消息顺序。 */
export function normalizeConversationMessages(messages: unknown[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  const calls = new Map<string, ToolCallInfo>();
  messages.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const message = value as { id?: string; role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: boolean; durationMs?: number };
    if (message.role === "toolResult") {
      const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
      if (call) {
        call.finishedAt = "recorded";
        if (typeof message.isError === "boolean") {
          call.isError = message.isError;
          call.outcome = message.isError ? "failed" : "succeeded";
        }
        call.result = contentToText(message.content);
        if (typeof message.durationMs === "number" && Number.isFinite(message.durationMs) && message.durationMs >= 0) call.elapsedMs = message.durationMs;
      }
      return;
    }
    const blocks = message.role === "assistant" && Array.isArray(message.content) ? message.content : [];
    const toolCalls: ToolCallInfo[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const tool = block as { type?: string; id?: unknown; name?: unknown; arguments?: unknown };
      if (tool.type !== "toolCall" || typeof tool.id !== "string" || typeof tool.name !== "string") continue;
      const call: ToolCallInfo = { callId: tool.id, name: tool.name, args: tool.arguments, finishedAt: "unknown", outcome: "unknown" };
      calls.set(tool.id, call);
      toolCalls.push(call);
    }
    const item = normalizeConversationMessage(message, index);
    if (item) items.push(toolCalls.length ? { ...item, toolCalls } : item);
    else if (toolCalls.length) items.push({ id: message.id ?? `assistant-${index}`, role: "assistant", text: "", toolCalls });
  });
  return items;
}
