/* 首次读取展示骨架，后台刷新保留会话，失败提供原刷新入口。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { CircleAlert, LoaderCircle, RotateCw } from "lucide-react";
import styles from "./WorkspaceNavigation.module.css";

interface NavigationLoadStateProps { loading?: boolean; error?: string | null; hasItems: boolean; onRetry?: () => void }
export function NavigationLoadState({ loading, error, hasItems, onRetry }: NavigationLoadStateProps) {
  if (error && !loading) return <div className={styles.loadState} data-navigation-status role="alert" title={error}>
    <CircleAlert size={13} /><span>会话暂时无法同步</span><button type="button" onClick={onRetry} aria-label="重试读取会话"><RotateCw size={13} /></button>
  </div>;
  if (!loading) return null;
  return <div data-navigation-status role="status" aria-label={hasItems ? "正在同步会话" : "正在读取会话"}>
    {hasItems ? <span className={styles.loadingPill}><LoaderCircle size={12} className={styles.spinner} />同步中</span>
      : <div className={styles.skeleton} aria-hidden="true"><i /><i /><i /></div>}
  </div>;
}
