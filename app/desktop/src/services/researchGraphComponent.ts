/* 科研任务关系图组件调用；交互事实与临时焦点由所属任务服务仲裁。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
export interface GraphSnapshot {
  revision: number;
  state?: import("./taskService").ResearchDecisionState;
  focus: { epoch: string; revision: number; target: string | null };
  interaction: { known: boolean; visible: boolean; editing: boolean; yielded: boolean; rendered: boolean; focusedRevision: number | null };
}
export async function researchGraphComponent(taskId: string, request: Record<string, unknown>): Promise<GraphSnapshot> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/components/research-graph`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("关系图交互反馈暂不可用");
  return response.json();
}
