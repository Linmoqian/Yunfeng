/* 科研消息分类：内部过程作为工具记录保留，反思作为助手答复。
 * Created on 2026-10-15
 * @author: https://github.com/Linmoqian
 */
/** 兼容旧任务中以助手角色保存的 Runtime 过程消息，不修改历史事件。 */
export function researchMessageRole(role: string, content: string): string {
  return role === "assistant" && /^(计划|决策|实验结果)：/.test(content) ? "tool" : role;
}
