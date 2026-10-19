/* 读取服务端持久化的本轮统计，避免把整个工作区或历史轮次混入胶囊。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useState } from "react";
import { loadTaskGit, type TaskGitSummary } from "../../../services/taskService";

export type LineCounts = { additions: number; deletions: number };
const FILE_LIMIT = 20;

export function useChangeSummary(taskId: string, revision: string, open: boolean) {
  const [summary, setSummary] = useState<TaskGitSummary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void loadTaskGit(taskId, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setSummary(value); setError(false); }
    }).catch(() => { if (!controller.signal.aborted) { setSummary(null); setError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, revision, open]);
  const allFiles = summary?.round?.files ?? [];
  const files = allFiles.slice(0, FILE_LIMIT);
  const counts = Object.fromEntries(files.map((file) => [file.filePath, file.additions === null || file.deletions === null ? null : { additions: file.additions, deletions: file.deletions }]));
  const totals = allFiles.length && allFiles.every((file) => file.additions !== null && file.deletions !== null)
    ? allFiles.reduce<LineCounts>((total, file) => ({ additions: total.additions + file.additions!, deletions: total.deletions + file.deletions! }), { additions: 0, deletions: 0 }) : null;
  return { summary, files, counts, totals, error, loading, totalFiles: allFiles.length };
}
