/* 会话读取占位：已有消息继续显示，首次读取使用轻量骨架。
 * Created on 2026-10-16
 * @author: https://github.com/Linmoqian
 */
import { LoaderCircle } from "lucide-react";
import styles from "./ConversationLoading.module.css";

export function ConversationLoading({ compact = false }: { compact?: boolean }) {
  return <div className={styles.loading} data-compact={compact || undefined} role="status" aria-label="正在读取会话">
    <span className={styles.pill}><LoaderCircle size={12} />读取会话</span>
    {!compact && <div className={styles.messages} aria-hidden="true"><div /><div><i /><i /><i /></div></div>}
  </div>;
}
