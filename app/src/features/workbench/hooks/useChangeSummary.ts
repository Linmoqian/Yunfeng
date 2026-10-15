/* 按任务读取工作区变更，展开时有界读取文件 diff，避免后台轮询与无限请求。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from "react";
import { loadTaskGit, loadTaskGitDiff, type TaskGitSummary } from "../../../services/taskService";

export type LineCounts = { additions: number; deletions: number };
const FILE_LIMIT = 20;

/** 只统计完整统一 diff 的 hunk 内容，文件头与无换行标记不计入行数。 */
export function countPatchLines(patch: string): LineCounts | null {
  let hunk = false, additions = 0, deletions = 0, found = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) hunk = false;
    if (line.startsWith("@@ ")) { hunk = true; found = true; continue; }
    if (!hunk) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return found ? { additions, deletions } : null;
}

export function useChangeSummary(taskId: string, revision: string, open: boolean) {
  const [summary, setSummary] = useState<TaskGitSummary | null>(null);
  const [counts, setCounts] = useState<Record<string, LineCounts | null>>({});
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const previous = useRef("");
  useEffect(() => {
    const key = `${taskId}:${revision}`;
    if (!open && previous.current === key) return;
    previous.current = key;
    const controller = new AbortController();
    setCounts({});
    void loadTaskGit(taskId, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setSummary(value); setError(false);
    }).catch(() => { if (!controller.signal.aborted) { setSummary(null); setError(true); } });
    return () => controller.abort();
  }, [taskId, revision, open]);
  useEffect(() => {
    if (!open || !summary?.isGitRepository) return;
    const controller = new AbortController();
    setLoading(true);
    const files = summary.files.slice(0, FILE_LIMIT);
    async function readCounts() {
      const result: Record<string, LineCounts | null> = {};
      for (let i = 0; i < files.length && !controller.signal.aborted; i += 4) {
        await Promise.all(files.slice(i, i + 4).map(async (file) => {
          try {
            const diff = await loadTaskGitDiff(taskId, file.filePath, controller.signal);
            result[file.filePath] = diff.supported && diff.patch ? countPatchLines(diff.patch) : null;
          } catch { result[file.filePath] = null; }
        }));
      }
      if (!controller.signal.aborted) { setCounts(result); setLoading(false); }
    }
    void readCounts();
    return () => controller.abort();
  }, [taskId, summary, open]);
  const files = summary?.files.slice(0, FILE_LIMIT) ?? [];
  const complete = Boolean(files.length && files.length === summary?.files.length && files.every((file) => counts[file.filePath]));
  const totals = complete ? Object.values(counts).reduce<LineCounts>((total, count) => ({ additions: total.additions + (count?.additions ?? 0), deletions: total.deletions + (count?.deletions ?? 0) }), { additions: 0, deletions: 0 }) : null;
  return { summary, files, counts, totals, error, loading };
}
