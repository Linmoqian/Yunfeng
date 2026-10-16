/* 输入区上方的只读变更胶囊与文件浮层，复用任务 Git 权限入口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { Popover } from "antd";
import { useRef, useState } from "react";
import { useChangeSummary, type LineCounts } from "../hooks/useChangeSummary";
import { Capsule } from "./Capsule";
import interaction from "./CapsuleInteraction.module.css";
import styles from "./ChangeSummary.module.css";

function Counts({ value }: { value: LineCounts }) {
  return <Capsule className={styles.counts} animateOnMount={false} value={`${value.additions}/${value.deletions}`}><span className={styles.additions} aria-label={`增加 ${value.additions} 行`}>+{value.additions}</span><span className={styles.deletions} aria-label={`删除 ${value.deletions} 行`}>-{value.deletions}</span></Capsule>;
}

export function ChangeSummary({ taskId, revision }: { taskId: string; revision: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { summary, files, counts, totals, error, loading } = useChangeSummary(taskId, revision, open);
  if (!error && (!summary?.isGitRepository || !summary.files.length)) return null;
  const content = <div className={styles.content} role="region" aria-label="变更文件">
    {error ? <p role="alert">变更读取失败，请重新打开重试。</p> : <>
      <ul className={styles.files}>{files.map((file) => <li key={file.filePath} className={styles.file}>
        <span className={styles.path} title={file.filePath}>{files.some((other) => other.filePath !== file.filePath && other.filePath.split(/[\\/]/).pop() === file.filePath.split(/[\\/]/).pop()) ? file.filePath : file.filePath.split(/[\\/]/).pop()}</span>
        {counts[file.filePath] ? <Counts value={counts[file.filePath]!} /> : <span className={styles.note}>{loading ? "读取中" : "未统计"}</span>}
      </li>)}</ul>
      <div className={styles.note}>工作区变更{summary!.baselineFiles.length ? ` · 含 ${summary!.baselineFiles.length} 个任务前已有文件` : ""}{summary!.files.length > files.length ? ` · 展示前 ${files.length} 项` : ""}</div>
      {!loading && !totals && <div className={styles.note}>部分文件不支持行数统计</div>}
    </>}
  </div>;
  return <div className={styles.dock} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <Capsule><Popover content={content} placement="top" trigger="click" open={open} onOpenChange={setOpen} arrow={false}>
      <button ref={trigger} type="button" className={`${styles.trigger} ${interaction.pressable}`} aria-expanded={open}>
        <span>{error ? "变更读取失败" : `${summary!.files.length} 个文件已更改`}</span>{totals && <Counts value={totals} />}
      </button>
    </Popover></Capsule>
  </div>;
}
