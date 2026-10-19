/* 科研组件公开快照；由服务端读取报告并随任务事件发布，前端不改写实测状态。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
export interface ResearchComponentSnapshot {
  component: "research"; revision: number;
  result?: ResearchResult;
  state: {
    jobId: string; source: string; updatedAt: string;
    progress?: { label: string; current: number; total?: number; unit?: string };
    metrics: { label: string; value: number; unit?: string }[];
    conclusion?: { summary: string; details?: string };
  };
}
export interface ResearchResult {
  job_id: string; status: "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  output?: string; evaluation?: { passed: boolean; actual?: unknown; reason: string };
}
