/* 输入区上方的只读变更胶囊与文件浮层，复用任务 Git 权限入口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Popover } from "antd";
import { useRef, useState } from "react";
import { useChangeSummary, type LineCounts } from "../hooks/useChangeSummary";
import { Capsule } from "./Capsule";
import { GitDiff } from "./GitDiff";
import interaction from "./CapsuleInteraction.module.css";
import styles from "./ChangeSummary.module.css";

function Counts({ value }: { value: LineCounts }) {
  return <Capsule className={styles.counts} animateOnMount={false} value={`${value.additions}/${value.deletions}`}><span className={styles.additions} aria-label={`增加 ${value.additions} 行`}>+{value.additions}</span><span className={styles.deletions} aria-label={`删除 ${value.deletions} 行`}>-{value.deletions}</span></Capsule>;
}

function fileLabel(path: string, files: Array<{ filePath: string }>) {
  const name = path.split(/[\\/]/).pop();
  return files.some((other) => other.filePath !== path && other.filePath.split(/[\\/]/).pop() === name) ? path : name;
}

export function ChangeSummary({ taskId, revision, allowDiff = false }: { taskId: string; revision: string; allowDiff?: boolean }) {
  const [open, setOpen] = useState(false);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { summary, files, counts, totals, error, loading, totalFiles } = useChangeSummary(taskId, revision, open);
  if (!error && !totalFiles && !diffPath) return null;
  const content = <div className={styles.content} role="region" aria-label="变更文件">
    {error ? <p role="alert">变更读取失败，请重新打开重试。</p> : <>
      <ul className={styles.files}>{files.map((file) => <li key={file.filePath} className={styles.file}>
        {allowDiff ? <button type="button" className={`${styles.path} ${styles.fileButton}`} title={file.filePath} aria-label={`查看 ${fileLabel(file.filePath, files)} 的 Git diff`} onClick={() => { setOpen(false); setDiffPath(file.filePath); }}>{fileLabel(file.filePath, files)}</button>
          : <span className={styles.path} title={file.filePath}>{fileLabel(file.filePath, files)}</span>}
        {counts[file.filePath] ? <Counts value={counts[file.filePath]!} /> : <span className={styles.note}>{loading ? "读取中" : "不支持统计"}</span>}
      </li>)}</ul>
      <div className={styles.note}>本轮变更{summary?.round?.interrupted ? " · 中断前已记录" : ""}{totalFiles > files.length ? ` · 展示前 ${files.length} 项` : ""}</div>
      {!loading && !totals && <div className={styles.note}>部分文件不支持行数统计</div>}
    </>}
  </div>;
  return <div className={styles.dock} onKeyDown={(event) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    if (diffPath) setDiffPath(null);
    else { setOpen(false); trigger.current?.focus(); }
  }}>
    <Capsule><Popover content={content} placement="top" trigger="click" open={open} onOpenChange={setOpen} arrow={false}>
      <button ref={trigger} type="button" className={`${styles.trigger} ${interaction.pressable}`} aria-expanded={open}>
        <span>{error ? "变更读取失败" : `${totalFiles} 个文件已更改 · 本轮`}</span>{totals && <Counts value={totals} />}
      </button>
    </Popover></Capsule>
    {allowDiff && <GitDiff taskId={taskId} filePath={diffPath} onClose={() => setDiffPath(null)} afterClose={() => trigger.current?.focus()} />}
  </div>;
}
