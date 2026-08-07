import { Button, Collapse, Input, App } from "antd";
import { Copy, GitCommitHorizontal, Rocket } from "lucide-react";
import { useEffect, useState } from "react";

import {
  commitTaskChanges,
  loadTaskGit,
  loadTaskGitDiff,
  requestTaskPush,
  type TaskGitSummary,
} from "../../../services/taskService";

interface GitChangesProps {
  taskId: string;
}

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function statusLabel(status: string): string {
  switch (status) {
    case "modified": return "改";
    case "added": return "增";
    case "deleted": return "删";
    case "untracked": return "新";
    case "renamed": return "重命名";
    default: return status;
  }
}

export function GitChanges({ taskId }: GitChangesProps) {
  const { message } = App.useApp();
  const [gitState, setGitState] = useState<TaskGitSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [diffOpenPath, setDiffOpenPath] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    void loadTaskGit(taskId, controller.signal)
      .then(setGitState)
      .catch(() => setGitState(null))
      .finally(() => setBusy(false));
    return () => controller.abort();
  }, [taskId, open]);

  async function toggleDiff(filePath: string) {
    if (diffOpenPath === filePath) {
      setDiffOpenPath(null);
      setDiffContent(null);
      return;
    }
    setDiffOpenPath(filePath);
    setBusy(true);
    try {
      const diff = await loadTaskGitDiff(taskId, filePath);
      setDiffContent(diff.supported && diff.patch ? diff.patch : "该文件暂不支持结构化 diff。");
    } catch {
      setDiffContent("读取 diff 失败。");
    } finally {
      setBusy(false);
    }
  }

  function copyPath(filePath: string) {
    void navigator.clipboard.writeText(filePath).then(
      () => message.success("路径已复制。"),
      () => message.error("复制失败。"),
    );
  }

  async function handleCommit() {
    if (!commitMessage.trim()) return;
    setBusy(true);
    try {
      await commitTaskChanges(taskId, commitMessage.trim());
      setCommitMessage("");
      message.success("本地提交完成。");
      const refreshed = await loadTaskGit(taskId);
      setGitState(refreshed);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handlePush() {
    setBusy(true);
    try {
      const result = await requestTaskPush(taskId);
      if (result.approvalRequestId) {
        message.info("推送审批已生成，请在审批卡确认。");
      } else {
        message.info("推送审批已排队。");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "推送失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Collapse
      ghost
      className="git-collapse"
      items={[
        {
          key: "git",
          label: <span className="focus-panel__config-toggle-label">改动</span>,
          children: (
            <div className="focus-panel__git-body">
              {busy && !gitState ? (
                <p className="focus-panel__config-note">正在读取 Git 状态…</p>
              ) : !gitState ? (
                <p className="focus-panel__config-note">无法读取 Git 状态（可能不是 Git 仓库）。</p>
              ) : !gitState.isGitRepository ? (
                <p className="focus-panel__config-note">当前目录不是 Git 仓库。</p>
              ) : gitState.taskFiles.length === 0 && gitState.baselineFiles.length === 0 ? (
                <p className="focus-panel__config-note">工作区干净，没有待提交改动。</p>
              ) : (
                <>
                  <div className="focus-panel__git-summary">
                    <span>任务产生 {gitState.taskFiles.length} 项</span>
                    {gitState.baselineFiles.length > 0 ? (
                      <span className="focus-panel__git-baseline">任务前已有 {gitState.baselineFiles.length} 项（不自动提交）</span>
                    ) : null}
                  </div>
                  <div className="focus-panel__git-files">
                    {gitState.taskFiles.map((file) => (
                      <div key={file.filePath} className="git-file">
                        <span className={`git-file__status git-file__status--${file.status}`}>{statusLabel(file.status)}</span>
                        <button type="button" className="git-file__name" onClick={() => void toggleDiff(file.filePath)}>
                          {basename(file.filePath)}
                        </button>
                        <button type="button" className="git-file__copy" onClick={() => copyPath(file.filePath)}>
                          <Copy size={11} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {diffOpenPath && diffContent ? (
                    <details className="focus-panel__diff" open>
                      <summary>diff · {basename(diffOpenPath)}</summary>
                      <pre><code>{diffContent}</code></pre>
                    </details>
                  ) : null}
                  <div className="focus-panel__git-actions">
                    <Input
                      className="focus-panel__git-message"
                      value={commitMessage}
                      onChange={(event) => setCommitMessage(event.target.value)}
                      placeholder="feat(server): 描述本次提交（Conventional Commits）"
                      disabled={busy}
                      onPressEnter={() => void handleCommit()}
                    />
                    <div className="focus-panel__git-buttons">
                      <Button
                        onClick={() => void handleCommit()}
                        disabled={busy || !commitMessage.trim()}
                        icon={<GitCommitHorizontal size={14} />}
                      >
                        本地提交
                      </Button>
                      <Button type="primary" onClick={() => void handlePush()} disabled={busy} icon={<Rocket size={14} />}>
                        推送（需审批）
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ),
        },
      ]}
      onChange={(keys) => setOpen(keys.length > 0)}
    />
  );
}
