/* 科研对话呈现：过滤历史过程消息，状态细节按需展示。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import type { ConversationItem } from "./conversationState";
import type { TaskState } from "../../services/taskService";

/** 历史 SSE 仍可能补发旧助手角色；仅对科研 Runtime 的固定过程前缀过滤。 */
export function researchConversation(items: ConversationItem[], mode?: TaskState["mode"]): ConversationItem[] {
  if (mode !== "research") return items;
  const visible: ConversationItem[] = [];
  for (const item of items) {
    if (item.role === "tool" || (item.role === "assistant" && /^(计划|决策|实验结果)：/.test(item.text))) continue;
    if (item.role !== "assistant") { visible.push(item); continue; }
    // 历史反思保留原始记录；仅移除自动追问和重复最终验收的流程复述。
    if (/^反思：\s*目标完成[：:]/.test(item.text) && visible.at(-1)?.role === "assistant" && visible.at(-1)?.text.startsWith("实验结论：")) continue;
    const text = item.text.startsWith("反思：")
      ? `实验结论：${item.text.slice(3).split(/\n\s*下一问题[：:]/, 1)[0].trim()}`
      : item.text.trim();
    if (!text || (visible.at(-1)?.role === "assistant" && visible.at(-1)?.text === text)) continue;
    visible.push({ ...item, text, thinking: undefined });
  }
  return visible;
}

/** 正常进展不直出模型依据；需要处理的错误或人工问题保持可见。 */
export function researchProgress(state: NonNullable<TaskState["autonomy"]>): string {
  if (state.phase === "FAILED" || state.phase === "PAUSED") return state.reason;
  if (state.phase === "WAITING") return state.approvalId ? "等待你确认实验计划。" : state.jobId ? "实验正在运行，完成后会核对结果。" : "等待项目变化或新的信息。";
  return { OBSERVING: "正在查看当前进展。", PLANNING: "正在评估下一步。", EXECUTING: "正在启动实验。", REFLECTING: "正在核对结果并整理结论。", COMPLETED: "目标验收条件已通过。" }[state.phase];
}
