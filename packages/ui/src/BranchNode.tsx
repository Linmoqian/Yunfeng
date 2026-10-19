/* 科研与评估共用关系节点：标题、灰色概述与按需展开的外围信息。
 * Created on 2026-10-18
 * @author: https://github.com/Linmoqian
 */
import type { ReactNode } from "react";
import styles from "./BranchNode.module.css";

export interface BranchNodeProps {
  title: string;
  summary: string;
  label?: string;
  current?: boolean;
  expanded?: boolean;
  agent?: boolean;
  kind?: string;
  status?: string;
  children?: ReactNode;
  onClick: () => void;
}

export function BranchNode({ title, summary, label, current, expanded, agent, kind, status, children, onClick }: BranchNodeProps) {
  return <div className={styles.node} data-status={status} data-current={current} data-agent={agent} data-kind={kind} data-expanded={expanded}>
    {children}
    <button type="button" className={`${styles.button} nodrag nopan`} onClick={onClick} aria-label={label ?? title} aria-expanded={expanded}>
      <span className={styles.title} title={title}>{title}</span>
      <span className={styles.summary} title={summary}>{summary}</span>
    </button>
  </div>;
}
