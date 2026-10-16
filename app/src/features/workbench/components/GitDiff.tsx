/* 开发会话的只读工作区差异，按需读取并取消过期请求。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { Button, Modal } from "antd";
import { useEffect, useState } from "react";
import { loadTaskGitDiff } from "../../../services/taskService";
import styles from "./GitDiff.module.css";

type DiffState = { path: string; patch?: string; error?: boolean; loading?: boolean };
const MAX_LINES = 4000;

export function GitDiff({ taskId, filePath, onClose, afterClose }: {
  taskId: string; filePath: string | null; onClose: () => void; afterClose: () => void;
}) {
  const [state, setState] = useState<DiffState>({ path: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!filePath) return;
    const controller = new AbortController();
    setState({ path: filePath, loading: true });
    void loadTaskGitDiff(taskId, filePath, controller.signal).then((result) => {
      if (!controller.signal.aborted) setState({ path: filePath, patch: result.supported ? result.patch : undefined });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ path: filePath, error: true });
    });
    return () => controller.abort();
  }, [taskId, filePath, retry]);
  const loading = state.path !== filePath || state.loading;
  const lines = state.patch?.split("\n") ?? [];
  return <Modal title={<span className={styles.title}>Git diff <span className={styles.scope}>当前工作区</span></span>}
    open={Boolean(filePath)} onCancel={onClose} afterClose={afterClose} footer={null}
    width={960} centered destroyOnHidden focusable={{ focusTriggerAfterClose: false }}>
    <div className={styles.path} title={filePath ?? ""}>{filePath}</div>
    <div className={styles.caption}>相对 HEAD 的当前差异；与本轮增删统计的范围可能不同。</div>
    <div className={styles.viewport} aria-label="文件差异" aria-busy={Boolean(loading)} tabIndex={0}>
      {loading ? <p className={styles.message} role="status">正在读取差异…</p>
        : state.error ? <div className={styles.message} role="alert">差异读取失败。<Button size="small" type="text" onClick={() => setRetry((value) => value + 1)}>重试</Button></div>
          : !state.patch ? <p className={styles.message}>当前没有可预览的文本差异。文件可能已提交、已还原，或为二进制、大文件。</p>
            : <pre className={styles.patch}>{lines.slice(0, MAX_LINES).map((line, index) => {
              const kind = line.startsWith("@@") ? "hunk" : /^(diff |index |--- |\+\+\+ |new file|deleted file)/.test(line) ? "header" : line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "context";
              return <span className={`${styles.line} ${styles[kind]}`} key={index}>{line || " "}</span>;
            })}</pre>}
    </div>
    {!loading && lines.length > MAX_LINES && <div className={styles.caption}>仅预览前 {MAX_LINES} 行，完整差异请在终端查看。</div>}
  </Modal>;
}
