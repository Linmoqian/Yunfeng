/* 侧边栏仅上报读取状态，复用工作区胶囊，失败保留刷新入口。
 * Created on 2026-10-17
 * @author: https://github.com/Linmoqian
 */
import { CircleAlert, RotateCw } from "lucide-react";
import { useWorkspaceLoading } from "./WorkspaceLoading";
import styles from "./WorkspaceNavigation.module.css";

interface NavigationLoadStateProps { loading?: boolean; error?: string | null; hasItems: boolean; onRetry?: () => void }
export function NavigationLoadState({ loading, error, onRetry }: NavigationLoadStateProps) {
  useWorkspaceLoading(Boolean(loading));
  if (error && !loading) return <div className={styles.loadState} data-navigation-status role="alert" title={error}>
    <CircleAlert size={13} /><span>会话暂时无法同步</span><button type="button" onClick={onRetry} aria-label="重试读取会话"><RotateCw size={13} /></button>
  </div>;
  return null;
}
