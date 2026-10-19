/* 打开关系图后补齐旧节点的 Agent 摘要；失败按需重试，不重连刷模型请求。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import type { ResearchDecisionState } from "../../../services/taskService";
import { researchGraphComponent } from "../../../services/researchGraphComponent";
export function useResearchGraphSummaries(task: string, revision: number, decision?: ResearchDecisionState, phase?: string) {
  const version = useRef(revision); version.current = revision;
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const missing = JSON.stringify(decision ? [decision.mission, ...decision.nodes].filter((node) => !node.presentation).map((node) => [node.id, node.objective]) : []);
  useEffect(() => {
    setError(false);
    if (missing === "[]" || !["WAITING", "PAUSED", "COMPLETED", "FAILED"].includes(phase ?? "")) { setBusy(false); return; }
    let closed = false;
    // 合并热更新和 React 挂载重试，避免同一画布连续请求。
    const timer = setTimeout(() => {
      setBusy(true);
      void researchGraphComponent(task, { action: "summarize", component: "research-graph", revision: version.current })
        .catch(() => { if (!closed) setError(true); })
        .finally(() => { if (!closed) setBusy(false); });
    }, 150);
    return () => { closed = true; clearTimeout(timer); };
  }, [task, missing, attempt, phase]);
  return { busy, error, retry: () => setAttempt((value) => value + 1) };
}
