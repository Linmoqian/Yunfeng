/* 科研对话呈现：过滤历史过程消息，状态细节按需展示。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
import type { ConversationItem } from "./conversationState";
import type { TaskState } from "../../services/taskService";

/** 历史 SSE 仍可能补发旧助手角色；仅对科研 Runtime 的固定过程前缀过滤。 */
export function researchConversation(items: ConversationItem[], mode?: TaskState["mode"]): ConversationItem[] {
  if (mode !== "research") return items;
  return items.filter((item) => item.role !== "tool" && !(item.role === "assistant" && /^(计划|决策|实验结果)：/.test(item.text)));
}

/** 正常进展不直出模型依据；需要处理的错误或人工问题保持可见。 */
export function researchProgress(state: NonNullable<TaskState["autonomy"]>): string {
  if (state.phase === "FAILED" || state.phase === "PAUSED") return state.reason;
  if (state.phase === "WAITING") return state.approvalId ? "等待你确认实验计划。" : state.jobId ? "实验正在运行，完成后会核对结果。" : "等待项目变化或新的信息。";
  return { OBSERVING: "正在查看当前进展。", PLANNING: "正在评估下一步。", EXECUTING: "正在启动实验。", REFLECTING: "正在核对结果并整理结论。", COMPLETED: "目标验收条件已通过。" }[state.phase];
}
